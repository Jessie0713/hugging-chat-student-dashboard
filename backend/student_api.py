# backend/student_api.py
from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from collections import Counter, defaultdict
from typing import Any
import json
from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId

from mongo_db import get_db_by_source, normalize_source
from db import fetch_one  # 你已經有 Moodle 的連線工具
from azure_openai import azure_chat
router = APIRouter(prefix="/api/{source}/student", tags=["student"])
def normalize_hf_user_id(hf_user_id: str) -> str:
    return (hf_user_id or "").strip()

async def find_user_by_hf_user_id(db, hf_user_id: str) -> dict | None:
    hf_user_id = normalize_hf_user_id(hf_user_id)

    # 1) exact match
    doc = await db["users"].find_one({"hfUserId": hf_user_id})
    if doc:
        return doc

    # 2) numeric-ish match（有些 DB 可能存 int）
    if hf_user_id.isdigit():
        doc = await db["users"].find_one({"hfUserId": int(hf_user_id)})
        if doc:
            return doc

    # 3) tolerant match: "154708," or whitespace
    safe = re.escape(hf_user_id)
    doc = await db["users"].find_one(
        {"hfUserId": {"$regex": rf"^{safe}\s*,?\s*$"}}
    )
    return doc
@router.get("/{hfUserId}/header")
async def header(source: str, hfUserId: str):
    db = get_db_by_source(source)
    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(404, "User not found in Mongo users")

    user_oid = user["_id"]
    conv_count = await db["conversations"].count_documents({"userId": user_oid})

    latest = await db["conversations"].find({"userId": user_oid}).sort([("updatedAt", -1)]).limit(1).to_list(1)
    latest_updated_at = latest[0].get("updatedAt") if latest else None

    return {
        "hfUserId": str(user.get("hfUserId")),
        "mongoUserId": str(user_oid),
        "createdAt": user.get("createdAt"),
        "updatedAt": user.get("updatedAt"),
        "conversationCount": conv_count,
        "latestConversationAt": latest_updated_at,
    }

# backend/student_api.py (Partial Update)

# ... (保留原本的 imports)
# 確保有 import build_assistant_name_map
# from student_api import build_assistant_name_map (如果在同檔案最後面有定義，則直接呼叫)


@router.post("/{hfUserId}/ai-advice")
async def ai_advice(source: str, hfUserId: str):
    """
    點擊後才觸發 AI 分析
    回傳固定 JSON 結構，方便前端直接排版
    """
    try:
        ov = await student_overview(source, hfUserId)
    except Exception as e:
        return {
            "ok": False,
            "intro": "",
            "suggestions": [],
            "plan": [],
            "rawText": f"[student_overview error] {str(e)}",
        }

    try:
        prompt_data = {
            "stats": ov.get("stats"),
            "top_assistants": ov.get("assistantUsage", [])[:5],
            "cefr_groups": ov.get("cefrGroups", []),
        }
    except Exception as e:
        return {
            "ok": False,
            "intro": "",
            "suggestions": [],
            "plan": [],
            "rawText": f"[prompt_data error] {str(e)}",
        }

    try:
        prompt = f"""
你是一個英文口說學習教練，正在為學生學習儀表板產生建議。

請根據提供的學生資料，輸出「有效 JSON」且只能輸出 JSON，
不要輸出任何前言、說明、markdown、```json 或其他文字。

請使用「繁體中文（台灣用語）」回答，不可使用簡體中文。

JSON 格式必須完全符合下面結構：
{{
  "intro": "1到3句整體觀察，使用繁體中文",
  "suggestions": [
    "建議1",
    "建議2",
    "建議3",
    "建議4",
    "建議5"
  ],
  "plan": [
    "Day 1 練習內容",
    "Day 2 練習內容",
    "Day 3 練習內容"
  ]
}}

規則：
1. intro 必須是字串
2. suggestions 必須剛好 5 項
3. plan 必須剛好 3 項
4. 每項內容要簡潔、具體、可執行
5. 一律使用繁體中文（台灣用語）
6. 不可使用簡體中文
7. 不要輸出 markdown，不要加註解，不要補充說明

學生資料如下：
{json.dumps(prompt_data, ensure_ascii=False, indent=2, default=str)}
""".strip()
    except Exception as e:
        return {
            "ok": False,
            "intro": "",
            "suggestions": [],
            "plan": [],
            "rawText": f"[prompt build error] {str(e)}",
        }

    try:
        text = await azure_chat(prompt)
        cleaned = (text or "").strip()

        # 清掉模型偶爾偷加的 code fence
        cleaned = re.sub(r"^```json\s*", "", cleaned)
        cleaned = re.sub(r"^```\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

        parsed = json.loads(cleaned)

        intro = parsed.get("intro", "")
        suggestions = parsed.get("suggestions", [])
        plan = parsed.get("plan", [])

        if not isinstance(intro, str):
            intro = ""

        if not isinstance(suggestions, list):
            suggestions = []

        if not isinstance(plan, list):
            plan = []

        suggestions = [str(x).strip() for x in suggestions if str(x).strip()]
        plan = [str(x).strip() for x in plan if str(x).strip()]

        suggestions = suggestions[:5]
        plan = plan[:3]

        while len(suggestions) < 5:
            suggestions.append("下一次對話時，請用完整句回答並補充一個原因或例子。")

        while len(plan) < 3:
            plan.append("安排 10 分鐘英文口說練習，並用 3 句完整句描述同一主題。")

        return {
            "ok": True,
            "intro": intro.strip(),
            "suggestions": suggestions,
            "plan": plan,
            "rawText": cleaned,
        }

    except Exception as e:
        return {
            "ok": False,
            "intro": "",
            "suggestions": [],
            "plan": [],
            "rawText": f"[ai_advice parse error] {str(e)}",
        }
        return {"text": f"AI 分析發生錯誤: {str(e)}"}

# CEFR levelKey → 外顯練習等級（與 Chat UI / Dashboard 一致）
CEFR_TO_PRACTICE_TIER: dict[str, str] = {
    "PreA1": "入門",
    "A1": "基礎",
    "A2": "基礎",
    "B1": "進階",
    "B2": "進階",
    "C1": "高階",
    "C2": "高階",
    "C1C2": "高階",
}

# 舊 users.badge.earnedIds → 新 Mongo badges.id（與 Chat UI LEGACY_BADGE_ID_MAP 對齊）
LEGACY_BADGE_ID_MAP: dict[str, str | None] = {
    "first_message": "egg_hatch",
    "effective_round": "first_nest",
    "topics_5": "trail_five",
    "topics_6": None,
    "topics_7": None,
    "advanced_cert": None,
}

# 純舊制／習慣型 id（僅標記 legacy，不進現行 earned）
LEGACY_HABIT_BADGE_IDS = {
    "streak_3",
    "streak_7",
    "levelup_3",
    "assist_3",
    "msg_100",
    "voice_master",
}


def remap_legacy_badge_ids(ids: list) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in ids or []:
        if not isinstance(raw, str):
            continue
        if raw in LEGACY_BADGE_ID_MAP:
            mapped = LEGACY_BADGE_ID_MAP[raw]
            if mapped and mapped not in seen:
                seen.add(mapped)
                out.append(mapped)
            continue
        if raw in LEGACY_HABIT_BADGE_IDS:
            continue
        if raw not in seen:
            seen.add(raw)
            out.append(raw)
    return out


async def load_badge_definitions(db) -> list[dict]:
    """讀 Mongo `badges` collection（enabled≠false，依 sortOrder）。"""
    try:
        cursor = db["badges"].find({"enabled": {"$ne": False}}).sort(
            [("sortOrder", 1)]
        )
        docs = await cursor.to_list(length=100)
    except Exception:
        return []

    defs: list[dict] = []
    for doc in docs:
        bid = doc.get("id")
        if not isinstance(bid, str) or not bid:
            continue
        threshold = int(doc.get("threshold") or 0)
        rule_type = doc.get("ruleType") or "completed_topics"
        defs.append(
            {
                "id": bid,
                "name": doc.get("name") or bid,
                "meaning": doc.get("meaning") or "",
                "unlock": doc.get("unlockText") or doc.get("unlock") or "",
                "iconUrl": doc.get("iconUrl") or "",
                "ruleType": rule_type,
                "threshold": threshold,
                "sortOrder": int(doc.get("sortOrder") or 0),
                "enabled": doc.get("enabled") is not False,
                "phase": doc.get("phase"),
            }
        )
    defs.sort(key=lambda d: d.get("sortOrder") or 0)
    return defs


def _practice_tier_from_level_key(level_key: str | None) -> str | None:
    if not level_key:
        return None
    return CEFR_TO_PRACTICE_TIER.get(level_key.strip())


def _normalize_achievement_badge_stats(badge_stats: dict) -> dict:
    """對齊 Chat UI users.badge.stats；舊欄位 fallback 避免舊資料全 0。"""
    per_assistant = badge_stats.get("perAssistant")
    if not isinstance(per_assistant, dict):
        per_assistant = {}

    if not per_assistant:
        qualified = badge_stats.get("qualifiedByAssistant") or {}
        effective_ids = {
            str(x) for x in (badge_stats.get("effectiveAssistantIds") or [])
        }
        for aid, count in qualified.items():
            aid_str = str(aid)
            ec = int(count or 0)
            per_assistant[aid_str] = {
                "effectiveCount": min(max(ec, 0), 8),
                "effectiveRoundComplete": aid_str in effective_ids or ec >= 8,
            }

    completed = badge_stats.get("completedTopicCount")
    if completed is None:
        completed = sum(
            1
            for v in per_assistant.values()
            if isinstance(v, dict) and v.get("effectiveRoundComplete")
        )

    max_eff = badge_stats.get("maxEffectiveCount")
    if max_eff is None:
        counts = [
            int(v.get("effectiveCount") or 0)
            for v in per_assistant.values()
            if isinstance(v, dict)
        ]
        max_eff = max(counts) if counts else 0

    advanced = badge_stats.get("advancedTopicCount")
    if advanced is None:
        advanced = len(badge_stats.get("effectiveAdvancedAssistantIds") or [])

    normalized_per: dict[str, dict] = {}
    for aid, info in per_assistant.items():
        if not isinstance(info, dict):
            continue
        ec = min(max(int(info.get("effectiveCount") or 0), 0), 8)
        normalized_per[str(aid)] = {
            "effectiveCount": ec,
            "effectiveRoundComplete": bool(
                info.get("effectiveRoundComplete") or ec >= 8
            ),
        }

    return {
        "totalMessages": int(badge_stats.get("totalMessages") or 0),
        "perAssistant": normalized_per,
        "completedTopicCount": int(completed or 0),
        "advancedTopicCount": int(advanced or 0),
        "maxEffectiveCount": int(max_eff or 0),
    }


def compute_grade_estimate(stats: dict, earned_ids: list) -> dict:
    """對齊恐龍獎章門檻：5→及格、8→優秀、10→滿分；進階 6 題。"""
    earned = set(earned_ids or [])
    completed = int(stats.get("completedTopicCount") or 0)
    advanced = int(stats.get("advancedTopicCount") or 0)

    score = None
    score_label = "尚未達標"
    badge_id = None

    if "rex_ten" in earned or completed >= 10:
        score, score_label, badge_id = 100, "滿分", "rex_ten"
    elif "armor_ready" in earned or completed >= 8:
        score, score_label, badge_id = 85, "優秀", "armor_ready"
    elif "trail_five" in earned or completed >= 5:
        score, score_label, badge_id = 65, "及格線", "trail_five"

    return {
        "score": score,
        "scoreLabel": score_label,
        "badgeId": badge_id,
        "completedTopicCount": completed,
        "advancedTopicCount": advanced,
        "levelRequirementMet": "kaiju_six" in earned or advanced >= 6,
    }


async def build_badge_topic_details(
    db,
    user: dict,
    badge_stats: dict,
) -> list[dict]:
    per_assistant = badge_stats.get("perAssistant") or {}
    agent_map: dict[str, dict] = {}
    for entry in user.get("agentCefr") or []:
        aid = entry.get("assistantId")
        if aid is not None:
            agent_map[str(aid)] = entry

    assistant_ids = list(per_assistant.keys())
    name_map = await build_assistant_name_map(db, assistant_ids)

    details = []
    for aid, info in per_assistant.items():
        if not isinstance(info, dict):
            continue
        agent = agent_map.get(aid, {})
        level_key = agent.get("levelKey")
        details.append({
            "assistantId": aid,
            "assistantName": name_map.get(aid, aid),
            "effectiveCount": int(info.get("effectiveCount") or 0),
            "effectiveRoundComplete": bool(info.get("effectiveRoundComplete")),
            "practiceTier": _practice_tier_from_level_key(level_key),
            "levelKey": level_key,
        })

    details.sort(
        key=lambda x: (
            not x.get("effectiveRoundComplete"),
            -(x.get("effectiveCount") or 0),
            x.get("assistantName") or "",
        ),
    )
    return details


def build_badge_payload(
    badge: dict,
    source: str,
    definitions: list[dict] | None = None,
) -> dict:
    """Normalize users.badge；earnedIds 對齊 Mongo `badges.id`（含舊 id remap）。"""
    badge_stats = badge.get("stats") or {}
    earned_raw = badge.get("earnedIds") or []
    earned_ids = earned_raw if isinstance(earned_raw, list) else []
    inbox = badge.get("inbox") or []

    stats = _normalize_achievement_badge_stats(badge_stats)
    remapped = remap_legacy_badge_ids(earned_ids)

    active_ids = {
        d["id"] for d in (definitions or []) if isinstance(d.get("id"), str)
    }
    if active_ids:
        active_earned = [e for e in remapped if e in active_ids]
        legacy_earned = [
            e
            for e in earned_ids
            if isinstance(e, str)
            and (
                e in LEGACY_HABIT_BADGE_IDS
                or e in LEGACY_BADGE_ID_MAP
                or e not in active_ids
            )
        ]
    else:
        # DB 尚無 badges 時：回傳 remap 後全部，避免全空
        active_earned = remapped
        legacy_earned = [
            e
            for e in earned_ids
            if isinstance(e, str)
            and (e in LEGACY_HABIT_BADGE_IDS or e in LEGACY_BADGE_ID_MAP)
        ]

    payload = {
        "earnedIds": active_earned,
        "legacyEarnedIds": legacy_earned,
        "inbox": inbox if isinstance(inbox, list) else [],
        "stats": stats,
        "gradeEstimate": compute_grade_estimate(stats, active_earned),
    }
    return payload


@router.get("/{hfUserId}/badges")
async def badges(source: str, hfUserId: str):
    db = get_db_by_source(source)
    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in Mongo users")

    definitions = await load_badge_definitions(db)
    badge_payload = build_badge_payload(
        user.get("badge") or {}, source, definitions
    )
    topic_details = await build_badge_topic_details(
        db, user, badge_payload["stats"]
    )
    return {
        "hfUserId": normalize_hf_user_id(hfUserId),
        "mongoUserId": str(user["_id"]),
        "badge": badge_payload,
        "badgeDefinitions": definitions,
        "badgeTopicDetails": topic_details,
    }
# backend/student_api.py


@router.get("/{hfUserId}/conversations")
async def conversations(source: str, hfUserId: str, skip: int = 0, limit: int = Query(20, ge=1, le=100)):
    db = get_db_by_source(source)
    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(404, "User not found")

    user_oid = user["_id"]

    docs = await (
        db["conversations"]
        .find({"userId": user_oid})
        .sort([("updatedAt", -1), ("_id", -1)])
        .skip(skip)
        .limit(limit)
        .to_list(length=limit)
    )

    assistant_ids = [doc.get("assistantId") for doc in docs if doc.get("assistantId")]
    name_map = await build_assistant_name_map(db, assistant_ids)

    items = []
    for doc in docs:
        raw_messages = doc.get("messages", []) or []
        messages = []

        for m in raw_messages:
            content = (m.get("content") or "").strip()
            if m.get("from") in ("user", "assistant") and content:
                messages.append({
                    "from": m.get("from"),
                    "content": content,
                    "isVoice": bool(m.get("isVoice", False)),
                })

        aid = doc.get("assistantId")
        aid_str = str(aid) if aid else None

        cefr = doc.get("cefr") or {}

        items.append({
            "_id": str(doc["_id"]),
            "assistantId": aid_str,
            "assistantName": name_map.get(aid_str, "Unknown Assistant") if aid_str else "Unknown Assistant",
            "updatedAt": doc.get("updatedAt"),
            "messages": messages,
            "cefr": {
                "levelKey": cefr.get("levelKey"),
                "nextLevelKey": cefr.get("nextLevelKey"),
                "confidence": cefr.get("confidence"),
                "updatedAt": cefr.get("updatedAt"),
                "assessedUserTurns": cefr.get("assessedUserTurns"),
                "assistantId": str(cefr.get("assistantId")) if cefr.get("assistantId") else None,
                "advice": cefr.get("advice") or {},
            } if cefr else None,
        })

    total = await db["conversations"].count_documents({"userId": user_oid})
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": items,
    }
@router.get("/{hfUserId}/profile")
async def profile(source: str, hfUserId: str):
    # URL 可能帶符號，保險先抽數字
    digits = re.sub(r"\D", "", hfUserId or "")
    if not digits:
        raise HTTPException(status_code=400, detail="Invalid user id")

    user_id = int(digits)

    # ✅ 最安全做法：fetch_one 支援參數化
    # row = fetch_one(
    #   "SELECT firstname, lastname, email FROM mdl_user WHERE id=%s",
    #   (user_id,)
    # )

    # ✅ 如果你目前 fetch_one 不支援 params：因為我們已經 int()，也不會注入
    row = fetch_one(f"SELECT firstname, lastname, email FROM mdl_user WHERE id = {user_id}")

    if not row:
        raise HTTPException(status_code=404, detail="Moodle user not found")

    return {
        "firstname": row.get("firstname"),
        "lastname": row.get("lastname"),
        "email": row.get("email"),
        "id": user_id,
    }
# ----------------------------
# Utils: assistantId -> name map
# ----------------------------
async def build_assistant_name_map(db, assistant_ids: list[Any]) -> dict[str, str]:
    meta = await build_assistant_meta_map(db, assistant_ids)
    return {aid: info.get("name") or "Unnamed" for aid, info in meta.items()}


async def build_assistant_meta_map(db, assistant_ids: list[Any]) -> dict[str, dict]:
    obj_ids: list[ObjectId] = []
    for a in assistant_ids:
        try:
            if isinstance(a, ObjectId):
                obj_ids.append(a)
            else:
                obj_ids.append(ObjectId(str(a)))
        except Exception:
            pass

    if not obj_ids:
        return {}

    m: dict[str, dict] = {}
    cursor = db["assistants"].find(
        {"_id": {"$in": obj_ids}},
        {"name": 1, "description": 1},
    )
    async for doc in cursor:
        aid = str(doc["_id"])
        m[aid] = {
            "name": doc.get("name") or "Unnamed",
            "description": (doc.get("description") or "").strip(),
        }
    return m

# ----------------------------
# fixed_level: conversations.cefr → 最近 N 筆聊天練習
# ----------------------------

def _as_utc_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


def build_recent_practice(
    convs: list[dict],
    assistant_meta_map: dict[str, dict] | dict[str, str],
    limit: int = 15,
    advanced_fit_goal: int = 6,
) -> tuple[list[dict], dict[str, int], dict]:
    """fixed_level：每個有 cefr 的 conversation 一筆，依 updatedAt 取最近 N 筆。

    另統計「選定進階且符合（in_band）」的聊天室數，供自我調節進度（目標預設 6）。
    """
    candidates: list[dict] = []

    for conv in convs:
        cefr = conv.get("cefr")
        if not cefr or not isinstance(cefr, dict):
            continue
        sort_ts = _as_utc_datetime(conv.get("updatedAt") or conv.get("createdAt"))
        if sort_ts is None:
            continue

        aid = conv.get("assistantId")
        aid_str = str(aid) if aid is not None else ""
        title = (conv.get("title") or "").strip()
        updated_at = conv.get("updatedAt") or conv.get("createdAt")
        meta = assistant_meta_map.get(aid_str)
        if isinstance(meta, dict):
            assistant_name = meta.get("name") or aid_str
            assistant_description = meta.get("description") or ""
        else:
            assistant_name = meta or aid_str
            assistant_description = ""

        candidates.append({
            "conversationId": str(conv["_id"]),
            "assistantId": aid_str,
            "assistantName": assistant_name,
            "assistantDescription": assistant_description,
            "conversationTitle": title or None,
            "targetProductTier": cefr.get("targetProductTier"),
            "targetBandLow": cefr.get("targetBandLow"),
            "targetBandHigh": cefr.get("targetBandHigh"),
            "levelKey": cefr.get("levelKey"),
            "nextLevelKey": cefr.get("nextLevelKey"),
            "confidence": cefr.get("confidence"),
            "fitStatus": cefr.get("fitStatus"),
            "assessedUserTurns": cefr.get("assessedUserTurns"),
            "lastEvalLevelKey": cefr.get("lastEvalLevelKey"),
            "advice": cefr.get("advice") or {},
            "updatedAt": updated_at,
            "_sortTs": sort_ts,
        })

    candidates.sort(key=lambda x: x["_sortTs"], reverse=True)

    # 全部聊天室：選定「進階」且 fitStatus=in_band（嚴格「符合進階」）
    advanced_room_ids: set[str] = set()
    for item in candidates:
        tier = str(item.get("targetProductTier") or "").strip()
        status = (
            str(item.get("fitStatus") or "")
            .strip()
            .lower()
            .replace("-", "_")
        )
        if tier == "進階" and status == "in_band":
            cid = item.get("conversationId") or item.get("assistantId")
            if cid:
                advanced_room_ids.add(str(cid))

    count = len(advanced_room_ids)
    advanced_progress = {
        "tier": "進階",
        "count": count,
        "goal": advanced_fit_goal,
        "met": count >= advanced_fit_goal,
        "mode": "fixed",
    }

    recent = candidates[:limit]
    for item in recent:
        item.pop("_sortTs", None)

    fit_summary: dict[str, int] = {
        "matched": 0,
        "unmatched": 0,
    }
    for item in recent:
        status = item.get("fitStatus")
        if status in ("in_band", "too_easy"):
            fit_summary["matched"] += 1
        else:
            fit_summary["unmatched"] += 1

    return recent, fit_summary, advanced_progress


def build_rolling_advanced_progress(
    agent_cefr: list[dict],
    goal: int = 6,
) -> dict:
    """rolling：agentCefr 中等級已達進階／高階的聊天室（assistant）數。"""
    advanced_ids: set[str] = set()
    for entry in agent_cefr or []:
        tier = _practice_tier_from_level_key(entry.get("levelKey"))
        if tier not in ("進階", "高階"):
            continue
        aid = entry.get("assistantId")
        if aid:
            advanced_ids.add(str(aid))
    count = len(advanced_ids)
    return {
        "tier": "進階",
        "count": count,
        "goal": goal,
        "met": count >= goal,
        "mode": "rolling",
    }


def build_cefr_groups_from_agent_cefr(
    agent_cefr: list[dict],
    cefr_meta_map: dict[str, dict],
) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for x in agent_cefr:
        level = (x.get("levelKey") or "Unknown").strip()
        aid = x.get("assistantId")
        aid_str = str(aid) if aid is not None else ""
        meta = cefr_meta_map.get(aid_str, {})
        groups[level].append({
            "assistantId": aid_str,
            "assistantName": meta.get("name") or aid_str,
            "assistantDescription": meta.get("description") or "",
            "levelKey": x.get("levelKey"),
            "nextLevelKey": x.get("nextLevelKey"),
            "confidence": x.get("confidence"),
            "updatedAt": x.get("updatedAt"),
            "advice": x.get("advice") or {},
        })

    order = ["PreA1", "A1", "A2", "B1", "B2", "C1", "C2", "C1C2"]

    def level_sort_key(k: str) -> int:
        return order.index(k) if k in order else 999

    cefr_groups = []
    for level in sorted(groups.keys(), key=level_sort_key):
        cefr_groups.append({
            "levelKey": level,
            "title": level,
            "assistants": groups[level],
        })
    return cefr_groups

# ----------------------------
# Metrics: 英文佔比 / 詞彙豐富度
# ----------------------------
_RE_EN = re.compile(r"[A-Za-z]")
_RE_HAN = re.compile(r"[\u4e00-\u9fff]")
_RE_WORD = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")

def analyze_text_metrics(text: str) -> tuple[float, float]:
    text = text or ""

    en_chars = len(_RE_EN.findall(text))
    han_chars = len(_RE_HAN.findall(text))
    total_letters = en_chars + han_chars
    english_ratio = (en_chars / total_letters) if total_letters else 0.0

    words = [w.lower() for w in _RE_WORD.findall(text)]
    lexical = (len(set(words)) / len(words)) if words else 0.0

    return english_ratio, lexical

def day_key(dt: datetime | None) -> str:
    if not dt:
        return "unknown"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")

def conversation_active_duration_min(
    messages: list[dict],
    idle_cutoff_seconds: int = 300,
) -> float:
    """
    計算有效互動時間：
    只累加相鄰訊息間隔 <= idle_cutoff_seconds 的時間。
    預設 300 秒 = 5 分鐘。
    """
    if not messages:
        return 0.0

    times: list[datetime] = []

    for m in messages:
        ts = (
            m.get("updatedAt")
            or m.get("createdAt")
            or m.get("time")
            or m.get("timestamp")
        )
        if isinstance(ts, datetime):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            times.append(ts)

    if len(times) < 2:
        return 0.0

    times.sort()

    total_seconds = 0.0
    for i in range(1, len(times)):
        gap = (times[i] - times[i - 1]).total_seconds()
        if 0 < gap <= idle_cutoff_seconds:
            total_seconds += gap

    return total_seconds / 60.0
# ----------------------------
# Overview API
# ----------------------------
@router.get("/{hfUserId}/overview")
async def student_overview(source: str, hfUserId: str):
    db = get_db_by_source(source)

    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in Mongo users")

    user_oid = user["_id"]

    # 取 conversations（你資料庫是 conversations.messages[]）
    convs = await db["conversations"].find({"userId": user_oid}).to_list(length=5000)

    # ---- assistant usage (by conversations count)
    assistant_counter = Counter()
    assistant_ids_for_lookup: list[Any] = []

    for c in convs:
        a = c.get("assistantId")
        if a is not None:
            assistant_counter[str(a)] += 1
            assistant_ids_for_lookup.append(a)

    assistant_meta_map = await build_assistant_meta_map(db, assistant_ids_for_lookup)
    assistant_name_map = {
        aid: (info.get("name") or aid) for aid, info in assistant_meta_map.items()
    }

    assistant_usage = []
    for aid, cnt in assistant_counter.most_common(8):
        assistant_usage.append({
            "assistantId": aid,
            "name": assistant_name_map.get(aid, aid),  # fallback: id
            "count": cnt,
        })

    # ---- compute overall stats
    all_text_parts: list[str] = []
    total_messages = 0
    turns_list = []
    duration_list = []

    for c in convs:
        msgs = c.get("messages") or []
        total_messages += len(msgs)

        # turns: count user messages
        turns = sum(1 for m in msgs if (m.get("from") == "user" and m.get("content")))
        turns_list.append(turns)

        # active duration: ignore long idle gaps
        active_duration_min = conversation_active_duration_min(msgs, idle_cutoff_seconds=300)
        duration_list.append(active_duration_min)

        for m in msgs:
            if m.get("from") in ("user", "assistant"):
                content = m.get("content") or ""
                if content.strip():
                    all_text_parts.append(content)

    full_text = "\n".join(all_text_parts)
    english_ratio, lexical_richness = analyze_text_metrics(full_text)

    avg_turns = round((sum(turns_list) / len(turns_list)), 2) if turns_list else 0
    avg_duration = round((sum(duration_list) / len(duration_list)), 2) if duration_list else 0

    stats = {
        "conversationCount": len(convs),
        "messageCount": total_messages,
        "englishRatio": round(english_ratio, 4),
        "lexicalRichness": round(lexical_richness, 4),
        "avgTurns": avg_turns,
        "avgDurationMin": avg_duration,
    }
   
    # ---- timeseries by day (use updatedAt if possible)
    by_day: dict[str, list[dict]] = defaultdict(list)
    for c in convs:
        k = day_key(c.get("updatedAt") or c.get("createdAt"))
        by_day[k].append(c)

    labels = sorted([k for k in by_day.keys() if k != "unknown"])
    ts_english, ts_lex, ts_turns, ts_dur = [], [], [], []

    for k in labels:
        subset = by_day[k]
        subset_text_parts = []
        subset_turns = []
        subset_durs = []

        for c in subset:
            msgs = c.get("messages") or []
            subset_turns.append(sum(1 for m in msgs if m.get("from") == "user" and m.get("content")))

            subset_durs.append(
                conversation_active_duration_min(msgs, idle_cutoff_seconds=300)
            )

            for m in msgs:
                if m.get("from") in ("user", "assistant"):
                    t = (m.get("content") or "").strip()
                    if t:
                        subset_text_parts.append(t)
        er, lx = analyze_text_metrics("\n".join(subset_text_parts))
        ts_english.append(round(er, 4))
        ts_lex.append(round(lx, 4))
        ts_turns.append(round(sum(subset_turns) / len(subset_turns), 2) if subset_turns else 0)
        ts_dur.append(round(sum(subset_durs) / len(subset_durs), 2) if subset_durs else 0)

    timeseries = {
        "labels": labels,
        "englishRatio": ts_english,
        "lexicalRichness": ts_lex,
        "avgTurns": ts_turns,
        "avgDurationMin": ts_dur,
    }

    is_fixed_level = normalize_source(source) == "fixed_level"
    recent_practice: list[dict] = []
    fit_summary: dict[str, int] = {}
    advanced_fit_progress: dict = {}
    cefr_groups: list[dict] = []

    if is_fixed_level:
        recent_practice, fit_summary, advanced_fit_progress = build_recent_practice(
            convs, assistant_meta_map
        )
    else:
        agent_cefr = user.get("agentCefr") or []
        cefr_assistant_ids = [
            x.get("assistantId") for x in agent_cefr if x.get("assistantId")
        ]
        cefr_meta_map = await build_assistant_meta_map(db, cefr_assistant_ids)
        cefr_groups = build_cefr_groups_from_agent_cefr(agent_cefr, cefr_meta_map)
        advanced_fit_progress = build_rolling_advanced_progress(agent_cefr)
    # ---- badge data（定義來自 Mongo badges）
    badge_definitions = await load_badge_definitions(db)
    badge_payload = build_badge_payload(
        user.get("badge") or {}, source, badge_definitions
    )

    stats_out = {
        **stats,
        "totalMessages": badge_payload["stats"]["totalMessages"],
    }

    badge_topic_details = await build_badge_topic_details(
        db, user, badge_payload["stats"]
    )

    return {
        "hfUserId": normalize_hf_user_id(hfUserId),
        "mongoUserId": str(user_oid),
        "stats": stats_out,
        "badge": badge_payload,
        "badgeDefinitions": badge_definitions,
        "badgeTopicDetails": badge_topic_details,
        "timeseries": timeseries,
        "assistantUsage": assistant_usage,
        "cefrGroups": cefr_groups,
        "recentPractice": recent_practice,
        "fitSummary": fit_summary,
        "advancedFitProgress": advanced_fit_progress,
    }

