# backend/topic_fit.py
"""成績審查：點選成績時檢查對話是否切題。變動等級看評級聊天室，固定等級看有效對話。獎章不收回。"""
from __future__ import annotations

import json
import re
from typing import Any

from bson import ObjectId

from azure_openai import azure_chat
from course_score import COURSE_BADGE_THEMES, compute_course_score, is_course_badge_theme
from mongo_db import normalize_source
from student_api import (
    build_badge_payload,
    build_badge_topic_details,
    find_user_by_hf_user_id,
    iter_user_message_texts,
    load_badge_definitions,
    message_plain_text,
    normalize_hf_user_id,
    resolve_badge_definitions,
    second_advanced_assistant_ids,
)

REDO_INSTRUCTION = (
    "雖符合有效對話，但內容不符合主題，該主題不計入成績。"
    "請到主系統重新開聊天室重做對話練習。"
)

REDO_INSTRUCTION_RATED = (
    "雖已完成評級，但內容不符合主題，該主題不計入成績。"
    "請到主系統重新開聊天室重做對話練習。"
)

_MAX_CHARS_PER_ROOM = 1400

# 各主題的辨識詞：用來擋住「把仿生學硬套到其他主題」這類誤判。
THEME_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Biomimicry Explainer": (
        "biomimicry", "biomimetic", "biomimic", "nature-inspir",
        "仿生", "生物仿生", "生物學", "biology", "gecko", "lotus leaf", "velcro",
        "kingfisher", "shark skin", "termite mound",
    ),
    "Panama Canal Story": (
        "panama", "canal", "巴拿馬", "運河", "isthmus", "船閘", "lock system",
        "gaillard",
    ),
    "VR Treatment Talk": (
        "virtual reality", "vr therapy", "vr treatment", "exposure therapy",
        "虛擬實境", "暴露治療", "phobia", "ptsd",
    ),
    "EQ vs IQ Compare": (
        "emotional intelligence", "eq vs", "iq vs", "eq and iq", "versus iq",
        "versus eq", "智商", "情商",
    ),
    "Can Machines Think?": (
        "turing", "can machines think", "machine consciousness",
        "機器會思考", "圖靈", "chinese room",
    ),
    "Handmade vs Machine Debate": (
        "handmade", "hand-made", "hand made", "craftsmanship",
        "mass produc", "手工", "量產", "匠人",
    ),
    "Future Movement Planner": (
        "future mobility", "future transport", "urban mobility",
        "未來交通", "移動規劃", "通勤", "transit",
    ),
    "Product Design Talk": (
        "product design", "user experience", "prototype",
        "產品設計", "使用者需求", "工業設計",
    ),
}

TOPIC_FIT_PROMPT = """你是嚴格的英語口說課助教。必須「逐間獨立」判斷，不可把某一間的內容或主題套用到其他間。

課程主題彼此不同、不可互換：
{theme_list}

每一筆只有該聊天室的學生發言。切題（onTopic=true）的唯一條件：學生發言的核心任務就是「這個」設定主題。
- Panama Canal Story → 必須在談巴拿馬運河／運河工程故事
- Biomimicry Explainer → 必須在談仿生設計（從自然學設計），不是泛泛生物學
- EQ vs IQ Compare → 必須在比較 EQ 與 IQ
- VR Treatment Talk → 必須在談虛擬實境治療
- Can Machines Think? → 必須在談機器能否思考
- Handmade vs Machine Debate → 必須在辯手工 vs 機器製造
- Future Movement Planner → 必須在談未來移動／交通規劃
- Product Design Talk → 必須在談產品設計

以下一律 onTopic=false：
- 發言其實在談另一個課程主題（例如在運河／EQ／VR 聊天室聊仿生學或生物學）
- 只是籠統的科學、環保、永續、科技閒聊
- 把仿生學硬解釋成「也算永續／科技／機器／交通」來湊其他主題
- 幾乎沒有針對該設定主題的實質發言
不要找牽強關聯。不確定就判 false。

只輸出 JSON：
{{
  "rooms": [
    {{
      "assistantId": "字串，必須與資料相同",
      "themeName": "設定主題名稱，必須與資料相同",
      "onTopic": false,
      "actualTheme": "學生實際最接近的課程主題名稱，對不上就寫 other",
      "reason": "一句繁體中文：學生實際在談什麼，為何符合或不符設定主題"
    }}
  ]
}}
資料：
{payload}
"""


def _is_rolling(source: str) -> bool:
    try:
        return normalize_source(source) == "rolling_level"
    except Exception:
        return (source or "").strip().lower() in ("rolling_level", "m7")


def _redo_instruction(source: str) -> str:
    return REDO_INSTRUCTION_RATED if _is_rolling(source) else REDO_INSTRUCTION


def _assistant_query_ids(assistant_id: str) -> list[Any]:
    ids: list[Any] = [assistant_id]
    try:
        ids.append(ObjectId(str(assistant_id)))
    except Exception:
        pass
    return ids


def _clip(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


async def _load_assistant_theme(db, assistant_id: str) -> dict[str, str]:
    fallback = next((t for t in COURSE_BADGE_THEMES if t["id"] == assistant_id), None)
    name = (fallback or {}).get("name") or assistant_id
    description = ""
    preprompt = ""
    try:
        oid = ObjectId(str(assistant_id))
    except Exception:
        oid = None
    query: dict[str, Any]
    if oid is not None:
        query = {"_id": oid}
    else:
        query = {"_id": assistant_id}
    doc = await db["assistants"].find_one(
        query,
        {"name": 1, "description": 1, "preprompt": 1},
    )
    if doc:
        name = (doc.get("name") or name or "").strip() or name
        description = (doc.get("description") or "").strip()
        preprompt = (doc.get("preprompt") or "").strip()
    return {
        "assistantId": assistant_id,
        "name": name,
        "description": description,
        "preprompt": preprompt,
    }


async def _user_talk_for_assistant(db, user_oid: ObjectId, assistant_id: str) -> str:
    convs = await db["conversations"].find(
        {
            "userId": user_oid,
            "assistantId": {"$in": _assistant_query_ids(assistant_id)},
        },
        {"messages.from": 1, "messages.content": 1, "updatedAt": 1, "createdAt": 1},
    ).to_list(length=80)
    parts: list[str] = []
    for conv in convs:
        for _day, text in iter_user_message_texts([conv]):
            if text:
                parts.append(text)
        if not parts:
            for m in conv.get("messages") or []:
                if m.get("from") == "user":
                    t = message_plain_text(m.get("content"))
                    if t:
                        parts.append(t)
    return _clip("\n".join(parts), _MAX_CHARS_PER_ROOM)


async def _user_talk_for_conversation(db, user_oid: ObjectId, conversation_id: str) -> str:
    ids: list[Any] = [conversation_id]
    try:
        ids.append(ObjectId(str(conversation_id)))
    except Exception:
        pass
    conv = await db["conversations"].find_one(
        {"_id": {"$in": ids}, "userId": user_oid},
        {"messages.from": 1, "messages.content": 1},
    )
    if not conv:
        return ""
    parts: list[str] = []
    for _day, text in iter_user_message_texts([conv]):
        if text:
            parts.append(text)
    if not parts:
        for m in conv.get("messages") or []:
            if m.get("from") == "user":
                t = message_plain_text(m.get("content"))
                if t:
                    parts.append(t)
    return _clip("\n".join(parts), _MAX_CHARS_PER_ROOM)


def _rated_course_rooms(user: dict) -> dict[str, str | None]:
    """變動等級：課程主題 → 評級聊天室 conversationId。"""
    out: dict[str, str | None] = {}
    for entry in user.get("agentCefr") or []:
        if not isinstance(entry, dict):
            continue
        if not entry.get("levelKey"):
            continue
        aid = entry.get("assistantId")
        if aid is None or not is_course_badge_theme(str(aid)):
            continue
        conv_id = entry.get("activeCefrConversationId")
        out[str(aid)] = str(conv_id).strip() if conv_id else None
    return out


async def _talk_for_room(
    db,
    user_oid: ObjectId,
    assistant_id: str,
    conversation_id: str | None,
    prefer_conversation: bool,
) -> str:
    if prefer_conversation:
        if conversation_id:
            return await _user_talk_for_conversation(db, user_oid, conversation_id)
        return await _user_talk_for_assistant(db, user_oid, assistant_id)
    return await _user_talk_for_assistant(db, user_oid, assistant_id)


async def _user_talk_for_conversation(db, user_oid: ObjectId, conversation_id: str) -> str:
    ids: list[Any] = [conversation_id]
    try:
        ids.append(ObjectId(str(conversation_id)))
    except Exception:
        pass
    conv = await db["conversations"].find_one(
        {"_id": {"$in": ids}, "userId": user_oid},
        {"messages.from": 1, "messages.content": 1},
    )
    if not conv:
        return ""
    parts: list[str] = []
    for _day, text in iter_user_message_texts([conv]):
        if text:
            parts.append(text)
    if not parts:
        for m in conv.get("messages") or []:
            if m.get("from") == "user":
                t = message_plain_text(m.get("content"))
                if t:
                    parts.append(t)
    return _clip("\n".join(parts), _MAX_CHARS_PER_ROOM)


def _rated_course_rooms(user: dict) -> dict[str, str | None]:
    """變動等級：課程主題 → 評級聊天室 conversationId。"""
    out: dict[str, str | None] = {}
    for entry in user.get("agentCefr") or []:
        if not isinstance(entry, dict):
            continue
        if not entry.get("levelKey"):
            continue
        aid = entry.get("assistantId")
        if aid is None or not is_course_badge_theme(str(aid)):
            continue
        conv_id = entry.get("activeCefrConversationId")
        out[str(aid)] = str(conv_id).strip() if conv_id else None
    return out


async def _talk_for_room(
    db,
    user_oid: ObjectId,
    assistant_id: str,
    conversation_id: str | None,
    prefer_conversation: bool,
) -> str:
    if prefer_conversation and conversation_id:
        talk = await _user_talk_for_conversation(db, user_oid, conversation_id)
        if talk:
            return talk
        return ""
    return await _user_talk_for_assistant(db, user_oid, assistant_id)


def _normalize_theme_name(name: str) -> str:
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", (name or "").lower())


def _theme_keyword_hits(theme_name: str, text: str) -> int:
    blob = (text or "").lower()
    keys = THEME_KEYWORDS.get(theme_name) or ()
    return sum(1 for key in keys if key.lower() in blob)


def _lookup_verdict(verdicts: dict[str, dict], row: dict, index: int | None = None) -> dict | None:
    aid = str(row.get("assistantId") or "")
    if aid in verdicts:
        return verdicts[aid]
    named = f"name:{row.get('themeName') or ''}"
    if named in verdicts:
        return verdicts[named]
    if index is not None:
        return verdicts.get(f"idx:{index}")
    return None


def _apply_theme_guard(row: dict, hit: dict) -> tuple[bool, str]:
    """LLM 若把別的主題（尤其仿生學）硬套過來，改判不符。"""
    assigned = (row.get("themeName") or "").strip()
    reason = str(hit.get("reason") or "").strip()
    talk = str(row.get("studentTalk") or "")
    blob = f"{talk}\n{reason}"
    on_topic = bool(hit.get("onTopic"))
    actual = str(hit.get("actualTheme") or "").strip()
    assigned_key = _normalize_theme_name(assigned)
    actual_key = _normalize_theme_name(actual)
    known = {
        _normalize_theme_name(t["name"]): t["name"] for t in COURSE_BADGE_THEMES
    }

    if actual_key and actual_key not in {"other", "none", "unknown", ""}:
        if actual_key in known and actual_key != assigned_key:
            detail = reason or f"學生實際在談「{known[actual_key]}」，不是「{assigned}」。"
            return False, detail

    assigned_hits = _theme_keyword_hits(assigned, blob)
    other_best = ""
    other_hits = 0
    for t in COURSE_BADGE_THEMES:
        if _normalize_theme_name(t["name"]) == assigned_key:
            continue
        n = _theme_keyword_hits(t["name"], blob)
        if n > other_hits:
            other_hits = n
            other_best = t["name"]

    if other_hits >= 1 and other_hits > assigned_hits:
        detail = reason or f"發言偏向「{other_best}」，不符合「{assigned}」。"
        return False, detail

    return on_topic, reason


def _parse_rooms_json(text: str) -> dict[str, dict]:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```json\s*", "", cleaned)
    cleaned = re.sub(r"^```\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", cleaned)
        parsed = json.loads(match.group(0) if match else cleaned)
    rooms = parsed.get("rooms") if isinstance(parsed, dict) else parsed
    out: dict[str, dict] = {}
    if not isinstance(rooms, list):
        return out
    idx = 0
    for row in rooms:
        if not isinstance(row, dict):
            continue
        aid = str(row.get("assistantId") or "").strip()
        theme_name = str(row.get("themeName") or row.get("assignedTheme") or "").strip()
        parsed_row = {
            "onTopic": bool(row.get("onTopic")),
            "actualTheme": str(row.get("actualTheme") or "").strip(),
            "reason": str(row.get("reason") or "").strip(),
        }
        out[f"idx:{idx}"] = parsed_row
        idx += 1
        if aid:
            out[aid] = parsed_row
        if theme_name:
            out[f"name:{theme_name}"] = parsed_row
    return out


async def _judge_rooms(rooms: list[dict]) -> dict[str, dict]:
    theme_names = [t["name"] for t in COURSE_BADGE_THEMES]
    payload = []
    for room in rooms:
        payload.append({
            "assistantId": room["assistantId"],
            "themeName": room["themeName"],
            "otherThemes": [n for n in theme_names if n != room["themeName"]],
            "themeBrief": _clip(
                " ".join(
                    x for x in (room.get("description"), room.get("preprompt")) if x
                ),
                500,
            ),
            "studentTalk": room["studentTalk"] or "（沒有學生發言）",
        })
    raw = await azure_chat(TOPIC_FIT_PROMPT.format(
        theme_list="\n".join(f"- {n}" for n in theme_names),
        payload=json.dumps(payload, ensure_ascii=False),
    ))
    return _parse_rooms_json(raw)


async def review_student_grade(db, source: str, hf_user_id: str) -> dict[str, Any]:
    hf = normalize_hf_user_id(hf_user_id)
    user = await find_user_by_hf_user_id(db, hf)
    if not user:
        raise ValueError("找不到學生")

    rolling = _is_rolling(source)
    redo_text = _redo_instruction(source)
    review_mode = "rated" if rolling else "effective"

    definitions = resolve_badge_definitions(await load_badge_definitions(db))
    badge_payload = await build_badge_payload(
        db, user, user.get("badge") or {}, hf, source, definitions
    )
    topic_details = await build_badge_topic_details(db, user, badge_payload["stats"])
    original = badge_payload.get("gradeEstimate") or {}
    stats = badge_payload.get("stats") or {}

    rated = _rated_course_rooms(user) if rolling else {}
    if rolling:
        candidates = [
            t for t in topic_details
            if str(t.get("assistantId") or "") in rated
        ]
    else:
        candidates = [
            t for t in topic_details
            if t.get("effectiveRoundComplete") and is_course_badge_theme(t.get("assistantId"))
        ]

    judged: list[dict[str, Any]] = []
    to_score: list[dict[str, Any]] = []
    for topic in candidates:
        aid = str(topic.get("assistantId"))
        theme = await _load_assistant_theme(db, aid)
        talk = await _talk_for_room(
            db,
            user["_id"],
            aid,
            rated.get(aid) if rolling else None,
            prefer_conversation=rolling,
        )
        row = {
            "assistantId": aid,
            "themeName": theme["name"] or topic.get("assistantName") or aid,
            "description": theme["description"],
            "preprompt": theme["preprompt"],
            "studentTalk": talk,
            "effectiveRoundComplete": bool(topic.get("effectiveRoundComplete")),
            "reviewKind": review_mode,
        }
        if not talk:
            judged.append({
                **row,
                "onTopic": False,
                "reason": f"幾乎沒有學生發言。{redo_text}",
                "needsRedo": True,
            })
        else:
            to_score.append(row)

    if to_score:
        try:
            verdicts = await _judge_rooms(to_score)
        except Exception:
            verdicts = {}
        for index, row in enumerate(to_score):
            hit = _lookup_verdict(verdicts, row, index)
            if hit is None:
                on_topic = True
                reason = "切題審查失敗，暫不標示。"
            else:
                on_topic, detail = _apply_theme_guard(row, hit)
                if on_topic:
                    reason = detail or "內容與設定主題一致。"
                else:
                    reason = f"{redo_text}{detail or '內容與設定主題不符。'}"
            judged.append({
                **row,
                "studentTalk": _clip(row["studentTalk"], 280),
                "onTopic": on_topic,
                "reason": reason,
                "needsRedo": not on_topic,
            })
    else:
        for row in judged:
            row["studentTalk"] = _clip(row.get("studentTalk") or "", 280)

    judged.sort(key=lambda x: (not x.get("needsRedo"), x.get("themeName") or ""))

    public_rooms = []
    for r in judged:
        public_rooms.append({
            "assistantId": r["assistantId"],
            "themeName": r["themeName"],
            "onTopic": bool(r.get("onTopic")),
            "needsRedo": bool(r.get("needsRedo")),
            "reason": r.get("reason") or "",
            "studentTalkPreview": r.get("studentTalk") or "",
            "reviewKind": r.get("reviewKind") or review_mode,
        })

    redo = [r for r in judged if r.get("needsRedo")]
    off_topic_ids = {str(r["assistantId"]) for r in redo}

    completed_ids = {
        str(t.get("assistantId"))
        for t in topic_details
        if t.get("effectiveRoundComplete") and is_course_badge_theme(t.get("assistantId"))
    }
    original_completed = int(
        stats.get("completedTopicCount") or original.get("completedTopicCount") or 0
    )
    scored_completed = len(completed_ids - off_topic_ids)
    dashboard_usage = int(
        original.get("dashboardUsageCount")
        or original.get("dashboardViewCount")
        or 0
    )
    adv_ids = await second_advanced_assistant_ids(db, user["_id"])
    scored_adv = len({aid for aid in adv_ids if aid not in off_topic_ids})
    adjusted = (
        compute_course_score(scored_completed, dashboard_usage, scored_adv)
        if off_topic_ids
        else original
    )
    original_score = int(original.get("score") or original.get("totalScore") or 0)
    adjusted_score = int(adjusted.get("score") or 0)

    reviewed_ids = {str(t.get("assistantId")) for t in candidates}
    pending_reason = "尚未評級。" if rolling else "尚未完成有效對話。"
    pending = [
        {
            "assistantId": t.get("assistantId"),
            "themeName": t.get("assistantName") or t.get("assistantId"),
            "effectiveRoundComplete": bool(t.get("effectiveRoundComplete")),
            "onTopic": None,
            "needsRedo": False,
            "reason": pending_reason,
        }
        for t in topic_details
        if str(t.get("assistantId") or "") not in reviewed_ids
    ]

    return {
        "source": source,
        "hfUserId": hf,
        "reviewMode": review_mode,
        "originalGrade": original,
        "grade": adjusted,
        "score": adjusted_score,
        "originalScore": original_score,
        "scoreAdjusted": original_score != adjusted_score,
        "badgesUnchanged": True,
        "completedTopics": original_completed,
        "scoredTopicCount": scored_completed,
        "reviewedRooms": public_rooms,
        "effectiveRooms": public_rooms,
        "redoRooms": [
            {
                "assistantId": r["assistantId"],
                "themeName": r["themeName"],
                "reason": r.get("reason") or "",
            }
            for r in redo
        ],
        "pendingRooms": pending,
    }
