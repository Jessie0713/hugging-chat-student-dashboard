# backend/assistant_store.py
"""助手營運資料的 Mongo 集合（與 rolling/fixed 學生資料分開標記）。"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from mongo_db import get_db_by_source, normalize_source

COLLECTIONS = {
    "sessions": "dashboard_assistant_sessions",
    "messages": "dashboard_assistant_messages",
    "feedback": "dashboard_assistant_feedback",
    "admins": "dashboard_admins",
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
    admins = col("admins")
    graph = col("graph")
    student_knowledge = col("student_knowledge")

    await sessions.create_index("sessionId", unique=True)
    await sessions.create_index([("actorId", 1), ("createdAt", -1)])
    await sessions.create_index("expiresAt", expireAfterSeconds=0)

    await messages.create_index([("sessionId", 1), ("createdAt", 1)])
    await messages.create_index("createdAt", expireAfterSeconds=ttl)

    await feedback.create_index([("sessionId", 1), ("messageId", 1), ("createdAt", -1)])
    await feedback.create_index("createdAt", expireAfterSeconds=ttl)

    await admins.create_index("username", unique=True)
    await graph.create_index("key", unique=True)
    await student_knowledge.create_index("key", unique=True)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def expires_at() -> datetime:
    return utcnow() + timedelta(days=retention_days())
