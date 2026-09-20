# backend/teacher_api.py
from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from azure_openai import azure_chat
from course_score import (
    DASHBOARD_ENTER_EVENT,
    DASHBOARD_PICK_EVENT,
    DASHBOARD_USAGE_WINDOW_HOURS,
    is_course_badge_theme,
    is_level_advanced,
)
from db import fetch_all
from mongo_db import get_db_by_source, normalize_source
from topic_fit import adjust_course_score_for_topic_fit, review_student_grade
from student_api import (
    _effective_complete_assistant_ids,
    _normalize_achievement_badge_stats,
    _practice_tier_from_level_key,
    analyze_text_metrics,
    conversation_active_duration_min,
    day_key,
    iter_user_message_texts,
    message_plain_text,
    normalize_hf_user_id,
    text_letter_counts,
)

router = APIRouter(prefix="/api/teacher", tags=["teacher"])

TEACHER_ACCESS_CODE = (os.getenv("TEACHER_ACCESS_CODE") or "111111").strip()
COHORTS = ("rolling_level", "fixed_level")


def _require_teacher(code: str | None) -> None:
    got = (code or "").strip()
    if got != TEACHER_ACCESS_CODE:
        raise HTTPException(status_code=401, detail="教師代碼不正確")


def _email_from_mongo_user(user: dict) -> str:
    for key in ("email", "mail", "userEmail"):
        val = user.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    emails = user.get("emails")
    if isinstance(emails, list) and emails:
        first = emails[0]
        if isinstance(first, str) and first.strip():
            return first.strip()
        if isinstance(first, dict):
            for key in ("email", "value", "address"):
                raw = first.get(key)
                if raw:
                    return str(raw).strip()
    username = str(user.get("username") or "").strip()
    if "@" in username:
        return username
    return ""


def _moodle_name_map(hf_user_ids: list[str]) -> dict[str, dict[str, str]]:
    """hfUserId → { firstname, lastname, displayName }；Moodle 連線失敗則回空。"""
    ids: list[int] = []
    seen: set[int] = set()
    for raw in hf_user_ids:
        digits = "".join(ch for ch in str(raw) if ch.isdigit())
        if not digits:
            continue
        try:
            uid = int(digits)
        except ValueError:
            continue
        if uid in seen:
            continue
        seen.add(uid)
        ids.append(uid)
    if not ids:
        return {}

    placeholders = ",".join(["%s"] * len(ids))
    try:
        rows = fetch_all(
            f"SELECT id, firstname, lastname, email FROM mdl_user WHERE id IN ({placeholders})",
            tuple(ids),
        )
    except Exception:
        return {}

    out: dict[str, dict[str, str]] = {}
    for row in rows or []:
        uid = row.get("id")
        if uid is None:
            continue
        firstname = str(row.get("firstname") or "").strip()
        lastname = str(row.get("lastname") or "").strip()
        email = str(row.get("email") or "").strip()
        display = f"{lastname}{firstname}".strip() or str(uid)
        out[str(uid)] = {
            "firstname": firstname,
            "lastname": lastname,
            "displayName": display,
            "email": email,
        }
    return out


def _attach_names(rows: list[dict]) -> list[dict]:
    names = _moodle_name_map([r.get("hfUserId") or "" for r in rows])
    for row in rows:
        hf = str(row.get("hfUserId") or "")
        digits = "".join(ch for ch in hf if ch.isdigit())
        info = names.get(hf) or names.get(digits) or {}
        row["firstname"] = info.get("firstname") or row.get("firstname") or ""
        row["lastname"] = info.get("lastname") or row.get("lastname") or ""
        if info.get("displayName"):
            row["displayName"] = info["displayName"]
        moodle_email = (info.get("email") or "").strip()
        row["email"] = moodle_email or (row.get("email") or "")
    return rows


def _as_utc(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _pair_usage(docs: list[dict]) -> int:
    window = timedelta(hours=DASHBOARD_USAGE_WINDOW_HOURS)
    picks: list[dict] = []
    enters: list[dict] = []
    for doc in docs:
        ev = doc.get("event")
        payload = doc.get("payload") if isinstance(doc.get("payload"), dict) else {}
        ts = doc.get("ts")
        if ev == DASHBOARD_PICK_EVENT:
            picks.append({
                "ts": ts,
                "pickId": (payload.get("pickId") or "").strip() or None,
                "conversationId": (payload.get("conversationId") or "").strip() or None,
            })
        elif ev == DASHBOARD_ENTER_EVENT:
            enters.append({
                "ts": ts,
                "pickId": (payload.get("pickId") or "").strip() or None,
                "conversationId": (payload.get("conversationId") or "").strip() or None,
            })

    used_enters: set[int] = set()
    matched = 0
    for pick in picks:
        pick_ts = pick.get("ts")
        if not isinstance(pick_ts, datetime):
            continue
        for idx, ent in enumerate(enters):
            if idx in used_enters:
                continue
            ent_ts = ent.get("ts")
            if not isinstance(ent_ts, datetime):
                continue
            delta = ent_ts - pick_ts
            if delta < timedelta(0) or delta > window:
                continue
            if pick["pickId"] and ent["pickId"] and pick["pickId"] == ent["pickId"]:
                used_enters.add(idx)
                matched += 1
                break
            if (
                pick["conversationId"]
                and ent["conversationId"]
                and pick["conversationId"] == ent["conversationId"]
            ):
                used_enters.add(idx)
                matched += 1
                break
    return matched


async def _conversation_bundle_by_user(db) -> tuple[dict[str, dict], dict[str, dict], dict[str, dict]]:
    """user mongo id → 語言 KPI、assistant 發言、conversation 發言。"""
    try:
        convs = await db["conversations"].find(
            {},
            {
                "userId": 1,
                "assistantId": 1,
                "messages.from": 1,
                "messages.content": 1,
                "messages.createdAt": 1,
                "messages.updatedAt": 1,
                "messages.time": 1,
                "messages.timestamp": 1,
                "updatedAt": 1,
                "createdAt": 1,
            },
        ).to_list(length=12000)
    except Exception:
        return {}, {}, {}

    by_user: dict[str, list[dict]] = defaultdict(list)
    for conv in convs:
        uid = conv.get("userId")
        if uid is None:
            continue
        by_user[str(uid)].append(conv)

    metrics: dict[str, dict] = {}
    talk_assistant: dict[str, dict[str, str]] = {}
    talk_conv: dict[str, dict[str, str]] = {}
    for uid, items in by_user.items():
        metrics[uid] = _language_stats_from_convs(items)
        by_aid: dict[str, list[str]] = defaultdict(list)
        by_cid: dict[str, str] = {}
        for conv in items:
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
            talk = "\n".join(parts)
            aid = conv.get("assistantId")
            if aid is not None and talk:
                by_aid[str(aid)].append(talk)
            by_cid[str(conv["_id"])] = talk
        talk_assistant[uid] = {aid: "\n".join(chunks) for aid, chunks in by_aid.items()}
        talk_conv[uid] = by_cid
    return metrics, talk_assistant, talk_conv


def _language_stats_from_convs(convs: list[dict]) -> dict[str, Any]:
    all_text_parts: list[str] = []
    turns_list: list[int] = []
    duration_list: list[float] = []
    latest = None
    for conv in convs:
        ts = _as_utc(conv.get("updatedAt") or conv.get("createdAt"))
        if ts and (latest is None or ts > latest):
            latest = ts
        msgs = conv.get("messages") or []
        turns_list.append(
            sum(1 for m in msgs if m.get("from") == "user" and message_plain_text(m.get("content")))
        )
        duration_list.append(conversation_active_duration_min(msgs, idle_cutoff_seconds=300))
    for _day, text in iter_user_message_texts(convs):
        all_text_parts.append(text)

    counts = text_letter_counts("\n".join(all_text_parts))
    has_text = bool(all_text_parts)
    return {
        "conversationCount": len(convs),
        "latestAt": latest,
        "enChars": int(counts["enChars"]),
        "hanChars": int(counts["hanChars"]),
        "englishRatio": round(float(counts["englishRatio"]), 4) if has_text else None,
        "lexicalRichness": round(float(counts["lexicalRichness"]), 4) if has_text else None,
        "avgTurns": round((sum(turns_list) / len(turns_list)), 2) if turns_list else 0,
        "avgDurationMin": round((sum(duration_list) / len(duration_list)), 2) if duration_list else 0,
    }


async def _usage_by_hf(db) -> dict[str, int]:
    by_user: dict[str, list[dict]] = defaultdict(list)
    try:
        cursor = db["dashboard_events"].find(
            {"event": {"$in": [DASHBOARD_PICK_EVENT, DASHBOARD_ENTER_EVENT]}},
            {"event": 1, "ts": 1, "payload": 1, "hfUserId": 1},
        ).sort([("ts", 1)])
        docs = await cursor.to_list(length=200000)
    except Exception:
        return {}
    for doc in docs:
        hf = normalize_hf_user_id(str(doc.get("hfUserId") or ""))
        if hf:
            by_user[hf].append(doc)
    return {hf: _pair_usage(items) for hf, items in by_user.items()}


async def _cefr_profile_by_user(
    db,
    users: list[dict],
) -> dict[str, dict]:
    """user mongo id → 二次進階數、大致 CEFR／練習等級。"""
    oid_to_effective: dict[str, set[str]] = {}
    oids: list[ObjectId] = []
    for user in users:
        uid = str(user["_id"])
        stats = _normalize_achievement_badge_stats((user.get("badge") or {}).get("stats") or {})
        oid_to_effective[uid] = _effective_complete_assistant_ids(stats)
        oids.append(user["_id"])

    by_user_assistant: dict[str, dict[str, list[str | None]]] = defaultdict(
        lambda: defaultdict(list)
    )
    try:
        cursor = db["cefrEvents"].find(
            {"userId": {"$in": oids}},
            {"userId": 1, "assistantId": 1, "levelKey": 1, "createdAt": 1},
        ).sort([("createdAt", 1)])
        docs = await cursor.to_list(length=200000)
    except Exception:
        docs = []

    for doc in docs:
        uid = str(doc.get("userId") or "")
        aid = doc.get("assistantId")
        if not uid or aid is None:
            continue
        by_user_assistant[uid][str(aid)].append(doc.get("levelKey"))

    level_rank = {
        "PreA1": 0,
        "A1": 1,
        "A2": 2,
        "B1": 3,
        "B2": 4,
        "C1": 5,
        "C2": 5,
        "C1C2": 5,
    }

    def typical_key(keys: list[str | None]) -> str | None:
        ranked = [k for k in keys if k and k in level_rank]
        if not ranked:
            return next((k for k in reversed(keys) if k), None)
        ranked.sort(key=lambda k: level_rank[k])
        return ranked[len(ranked) // 2]

    out: dict[str, dict] = {}
    for user in users:
        uid = str(user["_id"])
        by_aid = by_user_assistant.get(uid) or {}
        last_keys = [ratings[-1] for ratings in by_aid.values() if ratings]
        level_key = typical_key(last_keys)
        eff = oid_to_effective.get(uid) or set()
        n = 0
        adv_ids: set[str] = set()
        for aid, ratings in by_aid.items():
            if not is_course_badge_theme(aid):
                continue
            if aid not in eff:
                continue
            if len(ratings) < 2:
                continue
            if is_level_advanced(ratings[1]):
                n += 1
                adv_ids.add(str(aid))
        out[uid] = {
            "secondAdvanced": n,
            "secondAdvancedIds": adv_ids,
            "levelKey": level_key,
            "practiceTier": _practice_tier_from_level_key(level_key) or "尚未評級",
        }
    return out


def _summarize_user(
    source: str,
    user: dict,
    conv: dict | None,
    usage: int,
    profile: dict | None,
    talk_by_assistant: dict[str, str] | None = None,
    talk_by_conversation: dict[str, str] | None = None,
) -> dict[str, Any]:
    hf = normalize_hf_user_id(str(user.get("hfUserId") or ""))
    stats = _normalize_achievement_badge_stats((user.get("badge") or {}).get("stats") or {})
    completed_ids = _effective_complete_assistant_ids(stats)
    total_messages = int(stats.get("totalMessages") or 0)
    second_advanced_ids = set((profile or {}).get("secondAdvancedIds") or set())
    level_key = (profile or {}).get("levelKey")
    practice_tier = (profile or {}).get("practiceTier") or "尚未評級"
    fitted = adjust_course_score_for_topic_fit(
        source,
        user,
        completed_ids,
        second_advanced_ids,
        usage,
        talk_by_assistant,
        talk_by_conversation,
    )
    grade = fitted["grade"]
    completed = int(fitted["scoredTopicCount"])
    second_advanced = int(fitted["scoredAdvancedCount"])
    latest = _as_utc((conv or {}).get("latestAt") or user.get("updatedAt"))
    return {
        "hfUserId": hf,
        "mongoUserId": str(user["_id"]),
        "source": source,
        "sourceLabel": "固定等級" if source == "fixed_level" else "變動等級",
        "conversationCount": int((conv or {}).get("conversationCount") or 0),
        "enChars": int((conv or {}).get("enChars") or 0),
        "hanChars": int((conv or {}).get("hanChars") or 0),
        "englishRatio": (conv or {}).get("englishRatio"),
        "lexicalRichness": (conv or {}).get("lexicalRichness"),
        "avgTurns": float((conv or {}).get("avgTurns") or 0),
        "avgDurationMin": float((conv or {}).get("avgDurationMin") or 0),
        "totalMessages": total_messages,
        "completedTopicCount": completed,
        "dashboardUsageCount": usage,
        "secondAdvancedCount": second_advanced,
        "levelKey": level_key,
        "practiceTier": practice_tier,
        "earnedIds": [],
        "courseScore": grade.get("courseScore"),
        "totalScore": grade.get("totalScore"),
        "milestoneScore": grade.get("milestoneScore"),
        "guardianScore": grade.get("guardianScore"),
        "extraBonus": grade.get("extraBonus"),
        "scoreLabel": grade.get("scoreLabel"),
        "latestAt": latest.isoformat() if latest else None,
        "email": _email_from_mongo_user(user),
        "displayName": "",
    }


SCORE_HIST_LABELS = [f"{i}–{i + 9}" for i in range(0, 100, 10)] + ["100+"]


def _score_hist_label(score: Any) -> str:
    n = max(0, int(score or 0))
    if n >= 100:
        return "100+"
    lo = (n // 10) * 10
    return f"{lo}–{lo + 9}"


def _class_summary(rows: list[dict]) -> dict[str, Any]:
    n = len(rows)
    empty_hist = {label: 0 for label in SCORE_HIST_LABELS}
    empty_tiers = {"入門": 0, "基礎": 0, "進階": 0, "高階": 0, "尚未評級": 0}
    if n == 0:
        return {
            "studentCount": 0,
            "avgTotalScore": 0,
            "avgCourseScore": 0,
            "avgCompletedTopics": 0,
            "avgDashboardUsage": 0,
            "avgSecondAdvanced": 0,
            "avgEnglishRatio": 0,
            "avgLexicalRichness": 0,
            "avgTurns": 0,
            "avgDurationMin": 0,
            "goalMetCount": 0,
            "conversationTotal": 0,
            "tierBuckets": empty_tiers,
            "scoreHistogram": empty_hist,
        }

    def avg(key: str) -> float:
        return round(sum(float(r.get(key) or 0) for r in rows) / n, 2)

    en_chars = sum(int(r.get("enChars") or 0) for r in rows)
    han_chars = sum(int(r.get("hanChars") or 0) for r in rows)
    letter_total = en_chars + han_chars
    lex_vals = [
        float(r["lexicalRichness"])
        for r in rows
        if r.get("lexicalRichness") is not None
    ]

    hist = dict(empty_hist)
    for row in rows:
        hist[_score_hist_label(row.get("totalScore"))] += 1

    return {
        "studentCount": n,
        "avgTotalScore": avg("totalScore"),
        "avgCourseScore": avg("courseScore"),
        "avgCompletedTopics": avg("completedTopicCount"),
        "avgDashboardUsage": avg("dashboardUsageCount"),
        "avgSecondAdvanced": avg("secondAdvancedCount"),
        "avgEnglishRatio": round(en_chars / letter_total, 4) if letter_total else 0,
        "avgLexicalRichness": round(sum(lex_vals) / len(lex_vals), 4) if lex_vals else 0,
        "avgTurns": avg("avgTurns"),
        "avgDurationMin": avg("avgDurationMin"),
        "goalMetCount": sum(1 for r in rows if int(r.get("secondAdvancedCount") or 0) >= 5),
        "conversationTotal": sum(int(r.get("conversationCount") or 0) for r in rows),
        "tierBuckets": {
            label: sum(1 for r in rows if (r.get("practiceTier") or "尚未評級") == label)
            for label in ("入門", "基礎", "進階", "高階", "尚未評級")
        },
        "scoreHistogram": hist,
    }


async def _roster_for_source(source: str) -> list[dict]:
    src = normalize_source(source)
    db = get_db_by_source(src)
    users = await db["users"].find(
        {},
        {
            "hfUserId": 1,
            "badge": 1,
            "updatedAt": 1,
            "email": 1,
            "emails": 1,
            "username": 1,
            "mail": 1,
            "agentCefr": 1,
        },
    ).to_list(length=5000)

    conv_map, talk_assistant, talk_conv = await _conversation_bundle_by_user(db)
    usage_map = await _usage_by_hf(db)
    cefr_map = await _cefr_profile_by_user(db, users)

    tier_rank = {"入門": 0, "基礎": 1, "進階": 2, "高階": 3, "尚未評級": 4}

    rows: list[dict] = []
    for user in users:
        hf = normalize_hf_user_id(str(user.get("hfUserId") or ""))
        if not hf or hf == TEACHER_ACCESS_CODE:
            continue
        uid = str(user["_id"])
        rows.append(
            _summarize_user(
                src,
                user,
                conv_map.get(uid),
                int(usage_map.get(hf) or 0),
                cefr_map.get(uid) or {},
                talk_assistant.get(uid) or {},
                talk_conv.get(uid) or {},
            )
        )
    rows.sort(
        key=lambda r: (
            tier_rank.get(r.get("practiceTier") or "尚未評級", 9),
            -(r.get("totalScore") or 0),
            r.get("hfUserId") or "",
        )
    )
    return rows


@router.get("/auth")
async def teacher_auth(x_teacher_code: str | None = Header(default=None, alias="X-Teacher-Code")):
    _require_teacher(x_teacher_code)
    return {"ok": True, "cohorts": list(COHORTS)}


@router.get("/roster")
async def teacher_roster(
    source: str = Query("rolling_level"),
    x_teacher_code: str | None = Header(default=None, alias="X-Teacher-Code"),
):
    _require_teacher(x_teacher_code)
    src = (source or "").strip().lower()
    if src == "all":
        rolling = await _roster_for_source("rolling_level")
        fixed = await _roster_for_source("fixed_level")
        rows = _attach_names(rolling + fixed)
        return {
            "source": "all",
            "students": rows,
            "summary": _class_summary(rows),
            "byCohort": {
                "rolling_level": _class_summary(rolling),
                "fixed_level": _class_summary(fixed),
            },
        }

    if src not in COHORTS:
        raise HTTPException(status_code=400, detail="source 需為 rolling_level、fixed_level 或 all")

    rows = _attach_names(await _roster_for_source(src))
    return {
        "source": src,
        "students": rows,
        "summary": _class_summary(rows),
    }


@router.get("/grade-review")
async def teacher_grade_review(
    source: str = Query("rolling_level"),
    hfUserId: str = Query(...),
    x_teacher_code: str | None = Header(default=None, alias="X-Teacher-Code"),
):
    _require_teacher(x_teacher_code)
    src = (source or "").strip().lower()
    if src not in COHORTS:
        raise HTTPException(status_code=400, detail="source 需為 rolling_level 或 fixed_level")
    db = get_db_by_source(normalize_source(src))
    try:
        return await review_student_grade(db, src, hfUserId)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"切題審查失敗：{e}") from e


CONV_PROJECTION = {
    "messages.from": 1,
    "messages.content": 1,
    "messages.createdAt": 1,
    "messages.updatedAt": 1,
    "messages.time": 1,
    "messages.timestamp": 1,
    "updatedAt": 1,
    "createdAt": 1,
}


async def _load_conversations(source: str) -> list[dict]:
    db = get_db_by_source(normalize_source(source))
    try:
        return await db["conversations"].find({}, CONV_PROJECTION).to_list(length=12000)
    except Exception:
        return []


def _insights_from_convs(convs: list[dict]) -> dict[str, Any]:
    all_text_parts: list[str] = []
    turns_list: list[int] = []
    duration_list: list[float] = []
    by_day: dict[str, list[dict]] = defaultdict(list)
    texts_by_day: dict[str, list[str]] = defaultdict(list)

    for c in convs:
        msgs = c.get("messages") or []
        turns_list.append(
            sum(1 for m in msgs if m.get("from") == "user" and message_plain_text(m.get("content")))
        )
        duration_list.append(conversation_active_duration_min(msgs, idle_cutoff_seconds=300))
        conv_day = day_key(c.get("updatedAt") or c.get("createdAt"))
        if conv_day != "unknown":
            by_day[conv_day].append(c)

    for day, text in iter_user_message_texts(convs):
        all_text_parts.append(text)
        if day != "unknown":
            texts_by_day[day].append(text)

    english_ratio, lexical_richness = analyze_text_metrics("\n".join(all_text_parts))
    avg_turns = round((sum(turns_list) / len(turns_list)), 2) if turns_list else 0
    avg_duration = round((sum(duration_list) / len(duration_list)), 2) if duration_list else 0

    labels = sorted(set(by_day) | set(texts_by_day))
    ts_english, ts_lex, ts_turns, ts_dur = [], [], [], []
    acc_text: list[str] = []
    for k in labels:
        acc_text.extend(texts_by_day.get(k) or [])
        er, lx = analyze_text_metrics("\n".join(acc_text))
        ts_english.append(round(er, 4) if acc_text else None)
        ts_lex.append(round(lx, 4) if acc_text else None)
        subset = by_day.get(k) or []
        if not subset:
            ts_turns.append(None)
            ts_dur.append(None)
            continue
        subset_turns: list[int] = []
        subset_durs: list[float] = []
        for c in subset:
            msgs = c.get("messages") or []
            subset_turns.append(
                sum(1 for m in msgs if m.get("from") == "user" and message_plain_text(m.get("content")))
            )
            subset_durs.append(conversation_active_duration_min(msgs, idle_cutoff_seconds=300))
        ts_turns.append(round(sum(subset_turns) / len(subset_turns), 2) if subset_turns else 0)
        ts_dur.append(round(sum(subset_durs) / len(subset_durs), 2) if subset_durs else 0)

    return {
        "stats": {
            "conversationCount": len(convs),
            "englishRatio": round(english_ratio, 4) if all_text_parts else 0,
            "lexicalRichness": round(lexical_richness, 4) if all_text_parts else 0,
            "avgTurns": avg_turns,
            "avgDurationMin": avg_duration,
        },
        "timeseries": {
            "labels": labels,
            "englishRatio": ts_english,
            "lexicalRichness": ts_lex,
            "avgTurns": ts_turns,
            "avgDurationMin": ts_dur,
        },
    }


TS_METRIC_KEYS = ("englishRatio", "lexicalRichness", "avgTurns", "avgDurationMin")


def _aligned_compare_timeseries(rolling: dict, fixed: dict) -> dict[str, Any]:
    rolling_ts = rolling.get("timeseries") or {}
    fixed_ts = fixed.get("timeseries") or {}
    labels = sorted(
        set(rolling_ts.get("labels") or []) | set(fixed_ts.get("labels") or [])
    )

    def values(ts: dict, key: str) -> list[float | None]:
        mapped = {
            lab: val
            for lab, val in zip(ts.get("labels") or [], ts.get(key) or [])
        }
        return [mapped.get(lab) if lab in mapped else None for lab in labels]

    return {
        "labels": labels,
        "rolling_level": {key: values(rolling_ts, key) for key in TS_METRIC_KEYS},
        "fixed_level": {key: values(fixed_ts, key) for key in TS_METRIC_KEYS},
    }


@router.get("/insights")
async def teacher_insights(
    source: str = Query("rolling_level"),
    x_teacher_code: str | None = Header(default=None, alias="X-Teacher-Code"),
):
    _require_teacher(x_teacher_code)
    src = (source or "").strip().lower()
    if src == "all":
        rolling_convs = await _load_conversations("rolling_level")
        fixed_convs = await _load_conversations("fixed_level")
        rolling = _insights_from_convs(rolling_convs)
        fixed = _insights_from_convs(fixed_convs)
        out = _insights_from_convs(rolling_convs + fixed_convs)
        out["source"] = "all"
        out["byCohort"] = {
            "rolling_level": rolling,
            "fixed_level": fixed,
        }
        out["compareTimeseries"] = _aligned_compare_timeseries(rolling, fixed)
        return out
    if src not in COHORTS:
        raise HTTPException(status_code=400, detail="source 需為 rolling_level、fixed_level 或 all")
    out = _insights_from_convs(await _load_conversations(src))
    out["source"] = src
    return out


class TeacherAiIn(BaseModel):
    source: str = "rolling_level"
    scoreLabel: str | None = None
    students: list[dict[str, Any]] = Field(default_factory=list)
    stats: dict[str, Any] | None = None
    summary: dict[str, Any] | None = None


TEACHER_AI_PROMPT = """你是英語口說課的班級助教。請依資料用繁體中文產出 JSON，只輸出 JSON：
{{
  "teaching": "給老師的班級教學總結，最多 120 字。說明全班現況與下一步課堂重點。",
  "errors": "全班常見語言問題與課堂可處理的練習重點，最多 120 字。"
}}
資料不足就明說，不得捏造學生表現。
若 source 為 all 或資料含 byCohort，teaching 必須比較「變動等級」與「固定等級」的差距，不要只寫兩組合計。
資料：
{payload}
"""


@router.post("/ai-advice")
async def teacher_ai_advice(
    body: TeacherAiIn,
    x_teacher_code: str | None = Header(default=None, alias="X-Teacher-Code"),
):
    _require_teacher(x_teacher_code)
    snapshot = []
    for row in (body.students or [])[:60]:
        snapshot.append({
            "name": row.get("displayName") or row.get("hfUserId"),
            "group": row.get("sourceLabel") or row.get("source"),
            "score": row.get("totalScore"),
            "label": row.get("scoreLabel"),
            "topics": row.get("completedTopicCount"),
            "practice": row.get("dashboardUsageCount"),
            "advanced": row.get("secondAdvancedCount"),
        })
    payload = {
        "source": body.source,
        "filter": body.scoreLabel or "全部",
        "studentCount": len(body.students or []),
        "summary": body.summary,
        "languageStats": body.stats,
        "students": snapshot,
    }
    prompt = TEACHER_AI_PROMPT.format(
        payload=json.dumps(payload, ensure_ascii=False, default=str)
    )
    try:
        text = await azure_chat(prompt)
        cleaned = (text or "").strip()
        cleaned = re.sub(r"^```json\s*", "", cleaned)
        cleaned = re.sub(r"^```\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        parsed = json.loads(cleaned)
        teaching = parsed.get("teaching") or parsed.get("intro") or ""
        errors = parsed.get("errors") or ""
        if not isinstance(teaching, str):
            teaching = str(teaching or "")
        if not isinstance(errors, str):
            errors = str(errors or "")
        return {
            "ok": True,
            "teaching": teaching.strip(),
            "errors": errors.strip(),
            "rawText": cleaned,
        }
    except Exception as e:
        return {
            "ok": False,
            "teaching": "",
            "errors": "",
            "rawText": str(e),
        }
