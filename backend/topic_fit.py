# backend/topic_fit.py
"""教師成績審查：獎章與主系統一致；不符主題則該主題不計分，並請到主系統重做。"""
from __future__ import annotations

import json
import re
from typing import Any

from bson import ObjectId

from azure_openai import azure_chat
from course_score import COURSE_BADGE_THEMES, compute_course_score, is_course_badge_theme
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

_MAX_CHARS_PER_ROOM = 1400

TOPIC_FIT_PROMPT = """你是英語口說課助教。請判斷學生在各聊天室的發言是否與「設定主題」一致。
規則：
- 切題：學生有在練習該主題（相關詞彙、任務、情境），即使英文不完美也算切題。
- 答非所問：閒聊、自我介紹無關內容、完全另一個主題、或幾乎沒有針對該主題的實質發言。
只輸出 JSON：
{{
  "rooms": [
    {{"assistantId": "字串", "onTopic": true, "reason": "一句繁體中文說明"}}
  ]
}}
資料：
{payload}
"""


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


def _parse_rooms_json(text: str) -> dict[str, dict]:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```json\s*", "", cleaned)
    cleaned = re.sub(r"^```\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    parsed = json.loads(cleaned)
    rooms = parsed.get("rooms") if isinstance(parsed, dict) else parsed
    out: dict[str, dict] = {}
    if not isinstance(rooms, list):
        return out
    for row in rooms:
        if not isinstance(row, dict):
            continue
        aid = str(row.get("assistantId") or "").strip()
        if not aid:
            continue
        out[aid] = {
            "onTopic": bool(row.get("onTopic")),
            "reason": str(row.get("reason") or "").strip(),
        }
    return out


async def _judge_rooms(rooms: list[dict]) -> dict[str, dict]:
    payload = []
    for room in rooms:
        payload.append({
            "assistantId": room["assistantId"],
            "themeName": room["themeName"],
            "themeBrief": _clip(
                " ".join(
                    x for x in (room.get("description"), room.get("preprompt")) if x
                ),
                500,
            ),
            "studentTalk": room["studentTalk"] or "（沒有學生發言）",
        })
    raw = await azure_chat(TOPIC_FIT_PROMPT.format(
        payload=json.dumps(payload, ensure_ascii=False)
    ))
    return _parse_rooms_json(raw)


async def review_student_grade(db, source: str, hf_user_id: str) -> dict[str, Any]:
    hf = normalize_hf_user_id(hf_user_id)
    user = await find_user_by_hf_user_id(db, hf)
    if not user:
        raise ValueError("找不到學生")

    definitions = resolve_badge_definitions(await load_badge_definitions(db))
    badge_payload = await build_badge_payload(
        db, user, user.get("badge") or {}, hf, source, definitions
    )
    topic_details = await build_badge_topic_details(db, user, badge_payload["stats"])
    original = badge_payload.get("gradeEstimate") or {}

    effective = [
        t for t in topic_details
        if t.get("effectiveRoundComplete") and is_course_badge_theme(t.get("assistantId"))
    ]

    judged: list[dict[str, Any]] = []
    to_score: list[dict[str, Any]] = []
    for topic in effective:
        aid = str(topic.get("assistantId"))
        theme = await _load_assistant_theme(db, aid)
        talk = await _user_talk_for_assistant(db, user["_id"], aid)
        row = {
            "assistantId": aid,
            "themeName": theme["name"] or topic.get("assistantName") or aid,
            "description": theme["description"],
            "preprompt": theme["preprompt"],
            "studentTalk": talk,
            "effectiveRoundComplete": True,
        }
        if not talk:
            judged.append({
                **row,
                "onTopic": False,
                "reason": f"幾乎沒有學生發言。{REDO_INSTRUCTION}",
                "needsRedo": True,
            })
        else:
            to_score.append(row)

    if to_score:
        try:
            verdicts = await _judge_rooms(to_score)
        except Exception:
            verdicts = {}
        for row in to_score:
            aid = row["assistantId"]
            hit = verdicts.get(aid) or {}
            on_topic = bool(hit.get("onTopic")) if aid in verdicts else True
            if aid not in verdicts:
                reason = "切題審查失敗，暫不標示。"
            elif on_topic:
                reason = hit.get("reason") or "內容與設定主題一致。"
            else:
                detail = hit.get("reason") or "內容與設定主題不符。"
                reason = f"{REDO_INSTRUCTION}{detail}"
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
        })

    redo = [r for r in judged if r.get("needsRedo")]
    off_topic_ids = {str(r["assistantId"]) for r in redo}

    original_completed = int(
        (badge_payload.get("stats") or {}).get("completedTopicCount")
        or original.get("completedTopicCount")
        or 0
    )
    scored_completed = sum(
        1 for t in effective if str(t.get("assistantId")) not in off_topic_ids
    )
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

    pending = [
        {
            "assistantId": t.get("assistantId"),
            "themeName": t.get("assistantName") or t.get("assistantId"),
            "effectiveRoundComplete": False,
            "onTopic": None,
            "needsRedo": False,
            "reason": "尚未完成有效對話。",
        }
        for t in topic_details
        if not t.get("effectiveRoundComplete")
    ]

    return {
        "source": source,
        "hfUserId": hf,
        "originalGrade": original,
        "grade": adjusted,
        "score": adjusted_score,
        "originalScore": original_score,
        "scoreAdjusted": original_score != adjusted_score,
        "badgesUnchanged": True,
        "completedTopics": original_completed,
        "scoredTopicCount": scored_completed,
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
