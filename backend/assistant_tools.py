# backend/assistant_tools.py
"""受控查詢工具：一律呼叫既有業務服務，並依 actor 檢查歸屬。"""
from __future__ import annotations

from typing import Any, Callable, Awaitable

from fastapi import HTTPException

from assistant_auth import bound_hf_user_id, require_teacher_or_admin, student_source_or_401
from course_score import COURSE_BADGE_THEMES
from mongo_db import get_db_by_source, normalize_source
from student_api import (
    CEFR_TO_PRACTICE_TIER,
    build_badge_payload,
    build_badge_topic_details,
    find_user_by_hf_user_id,
    load_badge_definitions,
    resolve_badge_definitions,
    student_overview,
    _practice_tier_from_level_key,
)
from topic_fit import REVIEW_VERSION as TOPIC_REVIEW_VERSION


TOOL_SPECS = [
    {
        "type": "function",
        "function": {
            "name": "get_my_overview",
            "description": "查目前登入學生的總覽摘要（KPI、等級／適配、獎章數）。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_grade_breakdown",
            "description": "查目前登入學生的成績拆解。只讀已存切題審查，不重新審查。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_topic_progress",
            "description": "查 8 個課程主題的有效對話與缺口。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_practice_recommendations",
            "description": "依既有練習建議進度摘要接下來可練什麼。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_conversation_analysis",
            "description": "查學生對話數量與語言指標摘要，不含完整對話內容。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_authorized_class_progress",
            "description": "教師查授權班級進度與未達標學生（去識別摘要）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "source": {
                        "type": "string",
                        "enum": ["rolling_level", "fixed_level", "all"],
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_authorized_class_issue_summary",
            "description": "教師查班級去識別問題與回饋彙整。",
            "parameters": {
                "type": "object",
                "properties": {
                    "source": {
                        "type": "string",
                        "enum": ["rolling_level", "fixed_level", "all"],
                    }
                },
            },
        },
    },
]


def specs_for_role(role: str) -> list[dict]:
    student = {
        "get_my_overview",
        "get_my_grade_breakdown",
        "get_my_topic_progress",
        "get_my_practice_recommendations",
        "get_my_conversation_analysis",
    }
    teacher = {
        "get_authorized_class_progress",
        "get_authorized_class_issue_summary",
    }
    if role == "student":
        names = student
    elif role == "teacher":
        names = teacher
    elif role == "admin":
        names = student | teacher
    else:
        names = set()
    return [s for s in TOOL_SPECS if s["function"]["name"] in names]


def _compact_overview(payload: dict[str, Any]) -> dict[str, Any]:
    stats = payload.get("stats") or {}
    badge = payload.get("badge") or {}
    grade = badge.get("gradeEstimate") or badge.get("courseScore") or {}
    adv = payload.get("advancedFitProgress") or {}
    return {
        "sourceNote": "資料來自既有 overview 服務",
        "stats": {
            "conversationCount": stats.get("conversationCount"),
            "englishRatio": stats.get("englishRatio"),
            "lexicalRichness": stats.get("lexicalRichness"),
            "avgTurns": stats.get("avgTurns"),
            "avgDurationMin": stats.get("avgDurationMin"),
            "totalMessages": stats.get("totalMessages"),
        },
        "unreviewedGrade": {
            "totalScore": grade.get("totalScore") or grade.get("score"),
            "milestoneScore": grade.get("milestoneScore"),
            "guardianScore": grade.get("guardianScore"),
            "extraBonus": grade.get("extraBonus"),
            "completedTopicCount": grade.get("completedTopicCount"),
            "dashboardUsageCount": grade.get("dashboardUsageCount"),
            "secondAdvancedCount": grade.get("secondAdvancedCount"),
        },
        "earnedBadgeCount": len(badge.get("earnedIds") or []),
        "advancedFitProgress": {
            "mode": adv.get("mode"),
            "tier": adv.get("tier"),
            "count": adv.get("count"),
            "goal": adv.get("goal"),
            "met": adv.get("met"),
        },
        "fitSummary": payload.get("fitSummary") or {},
        "practiceTierMap": CEFR_TO_PRACTICE_TIER,
    }


async def get_my_overview(actor: dict[str, Any], args: dict) -> dict[str, Any]:
    hf = bound_hf_user_id(actor)
    source = student_source_or_401(actor)
    payload = await student_overview(source, hf)
    return _compact_overview(payload)


async def get_my_grade_breakdown(actor: dict[str, Any], args: dict) -> dict[str, Any]:
    hf = bound_hf_user_id(actor)
    source = student_source_or_401(actor)
    db = get_db_by_source(source)
    user = await find_user_by_hf_user_id(db, hf)
    if not user:
        raise HTTPException(status_code=404, detail="找不到學生")
    definitions = resolve_badge_definitions(await load_badge_definitions(db))
    badge_payload = await build_badge_payload(
        db, user, user.get("badge") or {}, hf, source, definitions
    )
    original = badge_payload.get("gradeEstimate") or {}
    cache = user.get("topicFitReview") if isinstance(user.get("topicFitReview"), dict) else {}
    reviewed = None
    if cache.get("grade") and int(cache.get("reviewVersion") or 0) >= int(TOPIC_REVIEW_VERSION):
        reviewed = {
            "totalScore": (cache.get("grade") or {}).get("totalScore") or cache.get("score"),
            "milestoneScore": (cache.get("grade") or {}).get("milestoneScore"),
            "guardianScore": (cache.get("grade") or {}).get("guardianScore"),
            "extraBonus": (cache.get("grade") or {}).get("extraBonus"),
            "scoredTopicCount": cache.get("scoredTopicCount"),
            "secondAdvancedCount": cache.get("secondAdvancedCount"),
            "reviewMode": cache.get("reviewMode"),
        }
    return {
        "badgesUnchanged": True,
        "computedBy": "compute_course_score",
        "formula": "里程碑最高80 + 守護龍最高20 + 額外加成最高8 = 最高108",
        "originalGrade": {
            "totalScore": original.get("totalScore") or original.get("score"),
            "milestoneScore": original.get("milestoneScore"),
            "guardianScore": original.get("guardianScore"),
            "extraBonus": original.get("extraBonus"),
            "completedTopicCount": original.get("completedTopicCount"),
            "dashboardUsageCount": original.get("dashboardUsageCount"),
            "secondAdvancedCount": original.get("secondAdvancedCount"),
        },
        "reviewedGrade": reviewed,
        "reviewAvailable": reviewed is not None,
        "nextStep": None if reviewed else "請到總覽開啟「成績」分頁做切題審查。助手不會自動重算。",
    }


async def get_my_topic_progress(actor: dict[str, Any], args: dict) -> dict[str, Any]:
    hf = bound_hf_user_id(actor)
    source = student_source_or_401(actor)
    db = get_db_by_source(source)
    user = await find_user_by_hf_user_id(db, hf)
    if not user:
        raise HTTPException(status_code=404, detail="找不到學生")
    definitions = resolve_badge_definitions(await load_badge_definitions(db))
    badge_payload = await build_badge_payload(
        db, user, user.get("badge") or {}, hf, source, definitions
    )
    details = await build_badge_topic_details(db, user, badge_payload["stats"])
    missing = [
        {"assistantId": d["assistantId"], "assistantName": d["assistantName"]}
        for d in details
        if not d.get("effectiveRoundComplete")
    ]
    return {
        "courseThemes": [{"id": t["id"], "name": t["name"]} for t in COURSE_BADGE_THEMES],
        "topics": [
            {
                "assistantId": d["assistantId"],
                "assistantName": d["assistantName"],
                "effectiveRoundComplete": d.get("effectiveRoundComplete"),
                "effectiveCount": d.get("effectiveCount"),
                "levelKey": d.get("levelKey"),
                "practiceTier": d.get("practiceTier") or _practice_tier_from_level_key(d.get("levelKey")),
            }
            for d in details
        ],
        "missingEffectiveThemes": missing,
    }


async def get_my_practice_recommendations(actor: dict[str, Any], args: dict) -> dict[str, Any]:
    hf = bound_hf_user_id(actor)
    source = student_source_or_401(actor)
    payload = await student_overview(source, hf)
    adv = payload.get("advancedFitProgress") or {}
    details = payload.get("badgeTopicDetails") or []
    missing = [
        d.get("assistantName") or d.get("assistantId")
        for d in details
        if not d.get("effectiveRoundComplete")
    ]
    return {
        "guide": "請到練習建議頁走觀察→策劃→行動，再回主系統開聊天室。",
        "source": normalize_source(source),
        "advancedFitProgress": {
            "mode": adv.get("mode"),
            "count": adv.get("count"),
            "goal": adv.get("goal"),
            "met": adv.get("met"),
            "tier": adv.get("tier"),
        },
        "themesWithoutEffectiveRound": missing[:8],
        "note": "練習建議達標（5 題進階＋有效對話）與守護龍（第二次評級 B2+）是不同條件。",
    }


async def get_my_conversation_analysis(actor: dict[str, Any], args: dict) -> dict[str, Any]:
    hf = bound_hf_user_id(actor)
    source = student_source_or_401(actor)
    payload = await student_overview(source, hf)
    stats = payload.get("stats") or {}
    usage = payload.get("assistantUsage") or []
    return {
        "metricsFromStudentUtterancesOnly": True,
        "conversationCount": stats.get("conversationCount"),
        "englishRatio": stats.get("englishRatio"),
        "lexicalRichness": stats.get("lexicalRichness"),
        "avgTurns": stats.get("avgTurns"),
        "topAssistants": [
            {"name": u.get("name"), "count": u.get("count")} for u in usage[:5]
        ],
    }


def _deidentify_row(row: dict[str, Any], index: int) -> dict[str, Any]:
    return {
        "alias": f"student-{index + 1}",
        "source": row.get("source"),
        "practiceTier": row.get("practiceTier"),
        "levelKey": row.get("levelKey"),
        "totalScore": row.get("totalScore"),
        "completedTopicCount": row.get("completedTopicCount"),
        "secondAdvancedCount": row.get("secondAdvancedCount"),
        "dashboardUsageCount": row.get("dashboardUsageCount"),
        "conversationCount": row.get("conversationCount"),
    }


async def get_authorized_class_progress(actor: dict[str, Any], args: dict) -> dict[str, Any]:
    require_teacher_or_admin(actor)
    from teacher_api import _attach_names, _class_summary, _roster_for_source

    source = (args.get("source") or "rolling_level").strip().lower()
    if source == "all":
        rolling = await _roster_for_source("rolling_level")
        fixed = await _roster_for_source("fixed_level")
        rows = rolling + fixed
        behind_ids = [
            r for r in rows
            if int(r.get("completedTopicCount") or 0) < 2
        ]
        compact = [_deidentify_row(r, i) for i, r in enumerate(behind_ids[:20])]
        return {
            "source": "all",
            "summary": _class_summary(rows),
            "byCohort": {
                "rolling_level": _class_summary(rolling),
                "fixed_level": _class_summary(fixed),
            },
            "behindSample": compact,
            "behindCount": len(behind_ids),
        }

    if source not in ("rolling_level", "fixed_level"):
        raise HTTPException(status_code=400, detail="source 需為 rolling_level、fixed_level 或 all")
    rows = await _roster_for_source(source)
    behind_ids = [r for r in rows if int(r.get("completedTopicCount") or 0) < 2]
    return {
        "source": source,
        "summary": _class_summary(rows),
        "behindSample": [_deidentify_row(r, i) for i, r in enumerate(behind_ids[:20])],
        "behindCount": len(behind_ids),
        "studentCount": len(rows),
    }


async def get_authorized_class_issue_summary(actor: dict[str, Any], args: dict) -> dict[str, Any]:
    require_teacher_or_admin(actor)
    from assistant_store import col

    source = (args.get("source") or "").strip().lower()
    query: dict[str, Any] = {}
    if source in ("rolling_level", "fixed_level"):
        query["source"] = source
    clusters = await col("clusters").find(query).sort("updatedAt", -1).to_list(length=20)
    feedback = await col("feedback").find(query).sort("createdAt", -1).to_list(length=50)
    helpful = sum(1 for f in feedback if f.get("helpful") is True)
    unhelpful = sum(1 for f in feedback if f.get("helpful") is False)
    return {
        "source": source or "all",
        "feedbackCounts": {"helpful": helpful, "unhelpful": unhelpful, "total": len(feedback)},
        "clusters": [
            {
                "clusterKey": c.get("clusterKey"),
                "label": c.get("label") or c.get("normalizedQuestion"),
                "count": c.get("count"),
                "category": c.get("category"),
            }
            for c in clusters
            if not c.get("rawStudentText")
        ],
        "privacy": "僅去識別彙整，不含其他學生原話。",
    }


HANDLERS: dict[str, Callable[[dict[str, Any], dict], Awaitable[dict[str, Any]]]] = {
    "get_my_overview": get_my_overview,
    "get_my_grade_breakdown": get_my_grade_breakdown,
    "get_my_topic_progress": get_my_topic_progress,
    "get_my_practice_recommendations": get_my_practice_recommendations,
    "get_my_conversation_analysis": get_my_conversation_analysis,
    "get_authorized_class_progress": get_authorized_class_progress,
    "get_authorized_class_issue_summary": get_authorized_class_issue_summary,
}


async def run_tool(name: str, actor: dict[str, Any], args: dict | None = None) -> dict[str, Any]:
    if name not in HANDLERS:
        raise HTTPException(status_code=400, detail="未知工具")
    allowed = {s["function"]["name"] for s in specs_for_role(actor.get("role") or "public")}
    if name not in allowed:
        raise HTTPException(status_code=403, detail="沒有權限使用此查詢")
    # 永遠忽略呼叫端指定的 hfUserId / role
    safe_args = dict(args or {})
    safe_args.pop("hfUserId", None)
    safe_args.pop("actorId", None)
    safe_args.pop("role", None)
    return await HANDLERS[name](actor, safe_args)
