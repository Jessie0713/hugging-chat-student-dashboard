# backend/cefr_api.py
from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query

from mongo_db import get_db_by_source

router = APIRouter(prefix="/api/cefr", tags=["cefr"])

# CEFR levelKey -> numeric (0~5)
LEVEL_MAP: dict[str, int] = {
    "PreA1": 0,
    "A1": 1,
    "A2": 2,
    "B1": 3,
    "B2": 4,
    "C1C2": 5,
}

# Reverse list, 用 index 查 levelKey；給 daily 回傳 levelKeyRounded 用
LEVEL_KEYS: list[str] = ["PreA1", "A1", "A2", "B1", "B2", "C1C2"]


def _to_object_id(value: str, field: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ObjectId for {field}: {value!r}",
        )


def _level_from_key(level_key: str | None) -> int | None:
    if not level_key:
        return None
    return LEVEL_MAP.get(level_key)


def _build_match(
    user_oid: ObjectId,
    assistant_oid: ObjectId | None,
    start: datetime | None,
    end: datetime | None,
) -> dict[str, Any]:
    match: dict[str, Any] = {"userId": user_oid}
    if assistant_oid is not None:
        match["assistantId"] = assistant_oid

    if start or end:
        rng: dict[str, Any] = {}
        if start:
            rng["$gte"] = start
        if end:
            rng["$lte"] = end
        match["createdAt"] = rng

    return match


@router.get("/trends")
async def cefr_trends(
    user_id: str = Query(..., description="Mongo ObjectId for users._id"),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    assistant_id: str | None = Query(None),
    limit: int = Query(5000, ge=1, le=20000),
    source: str = Query("m7"),
):
    """
    Raw CEFR points（不聚合）。
    回傳：{ points: [{ ts, levelKey, level, confidence, assistantId, conversationId }] }
    """
    user_oid = _to_object_id(user_id, "user_id")
    assistant_oid = _to_object_id(assistant_id, "assistant_id") if assistant_id else None

    db = get_db_by_source(source)

    match = _build_match(user_oid, assistant_oid, start, end)

    projection = {
        "_id": 0,
        "createdAt": 1,
        "levelKey": 1,
        "confidence": 1,
        "assistantId": 1,
        "conversationId": 1,
    }

    cursor = (
        db["cefrEvents"]
        .find(match, projection)
        .sort([("createdAt", 1)])
        .limit(limit)
    )

    docs = await cursor.to_list(length=limit)

    points = []
    for d in docs:
        level_key = d.get("levelKey")
        points.append({
            "ts": d.get("createdAt"),
            "levelKey": level_key,
            "level": _level_from_key(level_key),
            "confidence": d.get("confidence"),
            "assistantId": str(d["assistantId"]) if d.get("assistantId") else None,
            "conversationId": str(d["conversationId"]) if d.get("conversationId") else None,
        })

    return {"points": points}


@router.get("/trends/daily")
async def cefr_trends_daily(
    user_id: str = Query(..., description="Mongo ObjectId for users._id"),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    assistant_id: str | None = Query(None),
    tz: str = Query("Asia/Taipei"),
    method: str = Query("avg", pattern="^(avg|median)$"),
    source: str = Query("m7"),
):
    """
    Daily aggregation（按天平滑）。
    回傳：{ series: [{ date, value, confidenceAvg, count, levelKeyRounded }] }
    median 暫不支援，會 fallback 為 avg。
    """
    user_oid = _to_object_id(user_id, "user_id")
    assistant_oid = _to_object_id(assistant_id, "assistant_id") if assistant_id else None

    db = get_db_by_source(source)

    match = _build_match(user_oid, assistant_oid, start, end)

    # $switch 把 levelKey 映射成 0~5
    add_level = {
        "$addFields": {
            "level": {
                "$switch": {
                    "branches": [
                        {"case": {"$eq": ["$levelKey", "PreA1"]}, "then": 0},
                        {"case": {"$eq": ["$levelKey", "A1"]}, "then": 1},
                        {"case": {"$eq": ["$levelKey", "A2"]}, "then": 2},
                        {"case": {"$eq": ["$levelKey", "B1"]}, "then": 3},
                        {"case": {"$eq": ["$levelKey", "B2"]}, "then": 4},
                        {"case": {"$eq": ["$levelKey", "C1C2"]}, "then": 5},
                    ],
                    "default": None,
                }
            }
        }
    }

    pipeline: list[dict[str, Any]] = [
        {"$match": match},
        add_level,
        {"$match": {"level": {"$ne": None}}},
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": "$createdAt",
                        "timezone": tz,
                    }
                },
                "value": {"$avg": "$level"},
                "confidenceAvg": {"$avg": "$confidence"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    cursor = db["cefrEvents"].aggregate(pipeline)
    rows = await cursor.to_list(length=None)

    series = []
    for r in rows:
        value = r.get("value")
        rounded_idx = None
        if isinstance(value, (int, float)):
            rounded_idx = max(0, min(len(LEVEL_KEYS) - 1, int(round(value))))

        series.append({
            "date": r.get("_id"),
            "value": value,
            "confidenceAvg": r.get("confidenceAvg"),
            "count": r.get("count", 0),
            "levelKeyRounded": LEVEL_KEYS[rounded_idx] if rounded_idx is not None else None,
        })

    return {"series": series, "method": "avg"}
