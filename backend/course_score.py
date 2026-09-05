# backend/course_score.py
"""新制課程成績：里程碑 80 + 進階守護龍 20 + 額外加成 8（最高 108）。"""
from __future__ import annotations

import os
from typing import Any

# 獎章／里程碑只認這 8 個課程主題（assistantId）
# 可用 env COURSE_BADGE_THEME_IDS=id1,id2,... 覆寫（逗號分隔）
DEFAULT_COURSE_BADGE_THEMES: list[dict[str, str]] = [
    {"id": "6a974e7833b25cbb33e62ee8", "name": "Future Movement Planner"},
    {"id": "6a974e2d33b25cbb33e62ed5", "name": "Panama Canal Story"},
    {"id": "6a974dd833b25cbb33e62ec2", "name": "VR Treatment Talk"},
    {"id": "6a974d9633b25cbb33e62eb1", "name": "EQ vs IQ Compare"},
    {"id": "6a974d5233b25cbb33e62ea2", "name": "Can Machines Think?"},
    {"id": "6a974cb033b25cbb33e62e7d", "name": "Handmade vs Machine Debate"},
    {"id": "6a974c0e33b25cbb33e62e5a", "name": "Biomimicry Explainer"},
    {"id": "6a974b1f33b25cbb33e62e1e", "name": "Product Design Talk"},
]


def _theme_ids_from_env() -> frozenset[str] | None:
    raw = (os.getenv("COURSE_BADGE_THEME_IDS") or "").strip()
    if not raw:
        return None
    ids = {x.strip() for x in raw.split(",") if x.strip()}
    return frozenset(ids) if ids else None


COURSE_BADGE_THEME_IDS: frozenset[str] = (
    _theme_ids_from_env()
    or frozenset(t["id"] for t in DEFAULT_COURSE_BADGE_THEMES)
)

COURSE_BADGE_THEMES: list[dict[str, str]] = [
    t
    for t in DEFAULT_COURSE_BADGE_THEMES
    if t["id"] in COURSE_BADGE_THEME_IDS
] or list(DEFAULT_COURSE_BADGE_THEMES)


def is_course_badge_theme(assistant_id: str | None) -> bool:
    if assistant_id is None:
        return False
    return str(assistant_id).strip() in COURSE_BADGE_THEME_IDS


def filter_course_theme_ids(ids: set[str] | list[str] | None) -> set[str]:
    return {str(x) for x in (ids or []) if is_course_badge_theme(x)}


# (need_topics, need_views, score)
MILESTONE_TIERS: list[tuple[int, int, int]] = [
    (8, 5, 80),
    (6, 4, 60),
    (4, 3, 50),
    (2, 2, 30),
]

BONUS_CAP = 8
GUARDIAN_MAX = 20
MILESTONE_MAX = 80
COURSE_MAX = 100
TOTAL_MAX = 108

ADVANCED_LEVEL_KEYS = frozenset({"B2", "C1", "C2", "C1C2"})

DASHBOARD_VIEW_EVENTS = frozenset({"dashboard_view", "practice_next_view"})
DASHBOARD_PICK_EVENT = "practice_room_pick"
DASHBOARD_ENTER_EVENT = "practice_room_enter"
DASHBOARD_USAGE_WINDOW_HOURS = 48

DEFAULT_BADGE_DEFINITIONS: list[dict[str, Any]] = [
    {
        "id": "egg_hatch",
        "name": "破殼而出",
        "meaning": "蛋裂聲起——你送出了第一聲開口，恐龍探險正式啟程。",
        "unlock": "第一次送出訊息（打字或語音皆可）",
        "iconUrl": "/dinosaurs/dino-egg.png",
        "ruleType": "total_messages",
        "threshold": 1,
        "sortOrder": 1,
        "scoreValue": 0,
    },
    {
        "id": "milestone_topics_2",
        "name": "足跡初現",
        "meaning": "探險小徑上留下第一批腳印，你也開始回營地查看地圖。",
        "unlock": "2 個主題有效一輪 + 依練習建議完成練習 2 次",
        "iconUrl": "/dinosaurs/dino-trail.png",
        "ruleType": "milestone_dual",
        "threshold": 2,
        "meta": {"views": 2, "baseScore": 30},
        "sortOrder": 2,
    },
    {
        "id": "milestone_topics_4",
        "name": "翼手龍觀察",
        "meaning": "翼手龍帶你從高處俯瞰練習足跡，學會觀察再出發。",
        "unlock": "4 個主題有效一輪 + 依練習建議完成練習 3 次",
        "iconUrl": "/dinosaurs/dino-flyer.png",
        "ruleType": "milestone_dual",
        "threshold": 4,
        "meta": {"views": 3, "baseScore": 50},
        "sortOrder": 3,
    },
    {
        "id": "milestone_topics_6",
        "name": "甲龍就緒",
        "meaning": "厚甲護身、策略在握——六片棲地都已有效練習。",
        "unlock": "6 個主題有效一輪 + 依練習建議完成練習 4 次",
        "iconUrl": "/dinosaurs/dino-armor.png",
        "ruleType": "milestone_dual",
        "threshold": 6,
        "meta": {"views": 4, "baseScore": 60},
        "sortOrder": 4,
    },
    {
        "id": "milestone_topics_8",
        "name": "棲地王者",
        "meaning": "八片棲地盡收腳下，你是這趟口說探險的王者。",
        "unlock": "8 個主題有效一輪 + 依練習建議完成練習 5 次",
        "iconUrl": "/dinosaurs/dino-rex.png",
        "ruleType": "milestone_dual",
        "threshold": 8,
        "meta": {"views": 5, "baseScore": 80},
        "sortOrder": 5,
    },
    {
        "id": "kaiju_guardian",
        "name": "守護神獸",
        "meaning": "五題二次評級達進階，神獸現身為你的進步守關。",
        "unlock": "5 個主題第二次評級達進階（或以上）且完成有效對話",
        "iconUrl": "/dinosaurs/dino-kaiju-happy.png",
        "ruleType": "advanced_second_rating",
        "threshold": 5,
        "sortOrder": 6,
        "scoreValue": 20,
    },
    {
        "id": "srl_reflect",
        "name": "回望探險家",
        "meaning": "你會定期回到營地檢視地圖，這是探險家自我調節的功課。",
        "unlock": "依練習建議完成練習 5 次",
        "iconUrl": "/dinosaurs/dino-explore.png",
        "ruleType": "dashboard_views",
        "threshold": 5,
        "sortOrder": 7,
    },
]


def milestone_score(completed_topics: int, dashboard_usage: int) -> int:
    for need_topics, need_views, score in MILESTONE_TIERS:
        if completed_topics >= need_topics and dashboard_usage >= need_views:
            return score
    return 0


def guardian_score(second_advanced_count: int) -> int:
    return min(max(int(second_advanced_count or 0), 0), 5) * 4


def extra_bonus(second_advanced_count: int, dashboard_usage: int) -> int:
    n = max(int(second_advanced_count or 0), 0)
    v = max(int(dashboard_usage or 0), 0)
    adv_extra = max(0, n - 5) * 2
    reflect_extra = max(0, v - 5) * 2
    return min(BONUS_CAP, adv_extra + reflect_extra)


def score_label_for(course_score: int, total_score: int) -> str:
    if total_score >= TOTAL_MAX:
        return "最高表現"
    if course_score >= COURSE_MAX:
        return "課程滿分"
    if course_score >= 80:
        return "接近滿分"
    if course_score >= 60:
        return "持續精進"
    if course_score >= 50:
        return "穩步前進"
    if course_score >= 30:
        return "起步達標"
    return "尚未達標"


def compute_course_score(
    completed_topics: int,
    dashboard_usage: int,
    second_advanced_count: int,
) -> dict[str, Any]:
    milestone = milestone_score(completed_topics, dashboard_usage)
    guardian = guardian_score(second_advanced_count)
    extra = extra_bonus(second_advanced_count, dashboard_usage)
    course = milestone + guardian
    total = course + extra
    n = max(int(second_advanced_count or 0), 0)
    usage_count = max(int(dashboard_usage or 0), 0)

    return {
        "score": total,
        "totalScore": total,
        "scoreLabel": score_label_for(course, total),
        "milestoneScore": milestone,
        "guardianScore": guardian,
        "extraBonus": extra,
        "extraBonusCap": BONUS_CAP,
        "courseScore": course,
        "maxCourseScore": COURSE_MAX,
        "maxTotalScore": TOTAL_MAX,
        "completedTopicCount": int(completed_topics or 0),
        "dashboardUsageCount": usage_count,
        "dashboardViewCount": usage_count,
        "secondAdvancedCount": n,
        "guardianUnlocked": n >= 5,
        "reflectUnlocked": usage_count >= 5,
        "levelRequirementMet": n >= 5,
    }


def is_level_advanced(level_key: str | None) -> bool:
    if not level_key:
        return False
    return level_key.strip() in ADVANCED_LEVEL_KEYS


def count_second_advanced_from_events(events_by_assistant: dict[str, list[str]]) -> int:
    count = 0
    for ratings in events_by_assistant.values():
        if len(ratings) < 2:
            continue
        if is_level_advanced(ratings[1]):
            count += 1
    return count


def compute_earned_badge_ids(
    stats: dict[str, Any],
    completed_topics: int,
    dashboard_usage: int,
    second_advanced_count: int,
    definitions: list[dict[str, Any]] | None = None,
) -> list[str]:
    defs = definitions or DEFAULT_BADGE_DEFINITIONS
    earned: list[str] = []
    total_messages = int(stats.get("totalMessages") or 0)
    n = max(int(second_advanced_count or 0), 0)
    usage_count = max(int(dashboard_usage or 0), 0)
    topics = max(int(completed_topics or 0), 0)

    for d in defs:
        bid = d.get("id")
        if not isinstance(bid, str):
            continue
        rule = d.get("ruleType") or ""
        threshold = int(d.get("threshold") or 0)
        meta = d.get("meta") if isinstance(d.get("meta"), dict) else {}

        ok = False
        if rule == "total_messages":
            ok = total_messages >= threshold
        elif rule == "milestone_dual":
            need_views = int(meta.get("views") or 0)
            ok = topics >= threshold and usage_count >= need_views
        elif rule == "advanced_second_rating":
            ok = n >= threshold
        elif rule == "dashboard_views":
            ok = usage_count >= threshold
        elif rule == "completed_topics":
            ok = topics >= threshold
        elif rule == "advanced_topics":
            ok = int(stats.get("advancedTopicCount") or 0) >= threshold

        if ok:
            earned.append(bid)

    return earned
