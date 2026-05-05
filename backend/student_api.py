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

from mongo_db import get_db_by_source
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

@router.get("/{hfUserId}/badges")
async def badges(source: str, hfUserId: str):
    # 先回空；你之後可以建 collection: userBadges
    return {"hfUserId": hfUserId, "badges": []}
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

    m: dict[str, str] = {}
    cursor = db["assistants"].find({"_id": {"$in": obj_ids}}, {"name": 1})
    async for doc in cursor:
        m[str(doc["_id"])] = doc.get("name") or "Unnamed"
    return m

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

    assistant_name_map = await build_assistant_name_map(db, assistant_ids_for_lookup)

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

    # ---- CEFR groups: users.agentCefr[] 依 levelKey 分組，點 assistant 才看 advice
    agent_cefr = user.get("agentCefr") or []
    cefr_assistant_ids = [x.get("assistantId") for x in agent_cefr if x.get("assistantId")]
    cefr_name_map = await build_assistant_name_map(db, cefr_assistant_ids)

    groups: dict[str, list[dict]] = defaultdict(list)
    for x in agent_cefr:
        level = (x.get("levelKey") or "Unknown").strip()
        aid = x.get("assistantId")
        aid_str = str(aid) if aid is not None else ""
        groups[level].append({
            "assistantId": aid_str,
            "assistantName": cefr_name_map.get(aid_str, aid_str),
            "levelKey": x.get("levelKey"),
            "nextLevelKey": x.get("nextLevelKey"),
            "confidence": x.get("confidence"),
            "updatedAt": x.get("updatedAt"),
            "advice": x.get("advice") or {},
        })

    # 排序（大概照 CEFR 順序）
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
    # ---- badge data
    badge = user.get("badge") or {}
    badge_stats = badge.get("stats") or {}

    earned_ids = badge.get("earnedIds") or []
    inbox = badge.get("inbox") or []

    badge_payload = {
        "earnedIds": earned_ids if isinstance(earned_ids, list) else [],
        "inbox": inbox if isinstance(inbox, list) else [],
        "stats": {
            "lastActiveDate": badge_stats.get("lastActiveDate"),
            "streakDays": int(badge_stats.get("streakDays") or 0),
            "totalMessages": int(badge_stats.get("totalMessages") or 0),
            "voiceCount": int(badge_stats.get("voiceCount") or 0),
            "levelUpCount": int(badge_stats.get("levelUpCount") or 0),
            "assistantsUsed": badge_stats.get("assistantsUsed") or [],
        },
    }


    return {
        "hfUserId": normalize_hf_user_id(hfUserId),
        "mongoUserId": str(user_oid),
        "stats": {
            **stats,
            "streakDays": badge_payload["stats"]["streakDays"],
            "totalMessages": badge_payload["stats"]["totalMessages"],
            "voiceCount": badge_payload["stats"]["voiceCount"],
            "levelUpCount": badge_payload["stats"]["levelUpCount"],
            "assistantsUsed": badge_payload["stats"]["assistantsUsed"],
            "lastActiveDate": badge_payload["stats"]["lastActiveDate"],
        },"badge": badge_payload,
        "timeseries": timeseries,
        "assistantUsage": assistant_usage,
        "cefrGroups": cefr_groups,
    }

