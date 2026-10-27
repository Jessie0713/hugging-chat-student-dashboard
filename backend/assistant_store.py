# backend/assistant_store.py
"""助手與改版流程的 Mongo 集合（營運資料，與 rolling/fixed 學生資料分開標記）。"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from mongo_db import get_db_by_source, normalize_source

COLLECTIONS = {
    "sessions": "dashboard_assistant_sessions",
    "messages": "dashboard_assistant_messages",
    "feedback": "dashboard_assistant_feedback",
    "clusters": "dashboard_issue_clusters",
    "knowledge": "dashboard_knowledge_versions",
    "proposals": "dashboard_change_proposals",
    "releases": "dashboard_release_history",
    "jobs": "dashboard_improvement_jobs",
    "admins": "dashboard_admins",
    "settings": "dashboard_assistant_settings",
    "graph": "dashboard_teacher_graph",
    "student_knowledge": "dashboard_student_knowledge",
}

DEFAULT_TTL_DAYS = 180


def retention_days() -> int:
    try:
        return max(7, int(os.getenv("DASHBOARD_ASSISTANT_TTL_DAYS") or DEFAULT_TTL_DAYS))
    except ValueError:
        return DEFAULT_TTL_DAYS


def ops_source() -> str:
    raw = (os.getenv("DASHBOARD_OPS_SOURCE") or "rolling_level").strip()
    try:
        return normalize_source(raw)
    except Exception:
        return "rolling_level"


def get_ops_db():
    return get_db_by_source(ops_source())


def col(name: str):
    key = COLLECTIONS.get(name, name)
    return get_ops_db()[key]


async def ensure_indexes() -> None:
    ttl = retention_days() * 24 * 3600
    sessions = col("sessions")
    messages = col("messages")
    feedback = col("feedback")
    clusters = col("clusters")
    knowledge = col("knowledge")
    proposals = col("proposals")
    releases = col("releases")
    jobs = col("jobs")
    admins = col("admins")
    settings = col("settings")
    graph = col("graph")
    student_knowledge = col("student_knowledge")

    await sessions.create_index("sessionId", unique=True)
    await sessions.create_index([("actorId", 1), ("createdAt", -1)])
    await sessions.create_index("expiresAt", expireAfterSeconds=0)

    await messages.create_index([("sessionId", 1), ("createdAt", 1)])
    await messages.create_index("createdAt", expireAfterSeconds=ttl)

    await feedback.create_index([("processed", 1), ("createdAt", 1)])
    await feedback.create_index([("sessionId", 1), ("messageId", 1), ("createdAt", -1)])
    await feedback.create_index("createdAt", expireAfterSeconds=ttl)

    await clusters.create_index("clusterKey", unique=True)
    await clusters.create_index("updatedAt")

    await knowledge.create_index("versionId", unique=True)
    await knowledge.create_index([("status", 1), ("createdAt", -1)])

    await proposals.create_index("proposalId", unique=True)
    await proposals.create_index([("status", 1), ("createdAt", -1)])
    await proposals.create_index("contentHash")
    await jobs.create_index("jobKey", unique=True)
    await jobs.create_index([("status", 1), ("createdAt", -1)])
    await releases.create_index("createdAt")
    await admins.create_index("username", unique=True)
    await settings.create_index("key", unique=True)
    await graph.create_index("key", unique=True)
    await student_knowledge.create_index("key", unique=True)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def expires_at() -> datetime:
    return utcnow() + timedelta(days=retention_days())


async def get_setting(key: str, default: Any = None) -> Any:
    doc = await col("settings").find_one({"key": key})
    if not doc:
        return default
    return doc.get("value", default)


async def set_setting(key: str, value: Any) -> None:
    await col("settings").update_one(
        {"key": key},
        {"$set": {"key": key, "value": value, "updatedAt": utcnow()}},
        upsert=True,
    )
