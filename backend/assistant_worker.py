# backend/assistant_worker.py
"""獨立改版排程。不要從 FastAPI worker 啟動時各跑一份。預設停用。"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

from assistant_coding import run_coding_job
from assistant_improve import create_knowledge_proposal, ingest_feedback_clusters
from assistant_store import col, ensure_indexes, get_setting, utcnow


DEFAULT_SETTINGS = {
    "enabled": False,
    "timezone": "Asia/Taipei",
    "hour": 3,
    "minute": 0,
    "lookbackDays": 7,
    "maxItems": 80,
    "modelBudget": 20,
}


async def run_improvement_job(*, trigger: str, actor_id: str | None = None) -> dict:
    await ensure_indexes()
    settings = await get_setting("improvement", DEFAULT_SETTINGS)
    day = datetime.now(ZoneInfo(settings.get("timezone") or "Asia/Taipei")).date().isoformat()
    job_key = f"{trigger}:{day}" if trigger == "schedule" else f"{trigger}:{uuid.uuid4().hex[:10]}"
    existing = await col("jobs").find_one({"jobKey": job_key})
    if existing and existing.get("status") in ("done", "running"):
        return {"ok": False, "reason": "already_ran", "jobKey": job_key, "status": existing.get("status")}
    await col("jobs").update_one(
        {"jobKey": job_key},
        {"$set": {"status": "running", "startedAt": utcnow(), "trigger": trigger, "actorId": actor_id},
         "$setOnInsert": {"createdAt": utcnow(), "jobKey": job_key}},
        upsert=True,
    )
    try:
        clusters = await ingest_feedback_clusters(limit=int(settings.get("maxItems") or 80))
        created = await create_knowledge_proposal(clusters, job_id=job_key)
        code = await run_coding_job({
            "title": "說明文字／UI 自動修正",
            "paths": ["backend/knowledge/"],
        })
        await col("jobs").update_one(
            {"jobKey": job_key},
            {"$set": {
                "status": "done",
                "finishedAt": utcnow(),
                "clusters": len(clusters),
                "proposal": created,
                "coding": code,
            }},
        )
        return {"ok": True, "jobKey": job_key, "clusters": len(clusters), "proposal": created, "coding": code}
    except Exception as e:
        await col("jobs").update_one(
            {"jobKey": job_key},
            {"$set": {"status": "failed", "error": str(e), "finishedAt": utcnow()}},
        )
        raise


def _seconds_until_next(settings: dict) -> float:
    tz = ZoneInfo(settings.get("timezone") or "Asia/Taipei")
    now = datetime.now(tz)
    target = now.replace(
        hour=int(settings.get("hour") or 3),
        minute=int(settings.get("minute") or 0),
        second=0,
        microsecond=0,
    )
    if target <= now:
        target = target + timedelta(days=1)
    return max(30.0, (target - now).total_seconds())


async def loop():
    await ensure_indexes()
    while True:
        settings = await get_setting("improvement", DEFAULT_SETTINGS)
        if not settings.get("enabled"):
            await asyncio.sleep(30)
            continue
        wait = _seconds_until_next(settings)
        await asyncio.sleep(min(wait, 60))
        settings = await get_setting("improvement", DEFAULT_SETTINGS)
        if not settings.get("enabled"):
            continue
        now = datetime.now(ZoneInfo(settings.get("timezone") or "Asia/Taipei"))
        if now.hour == int(settings.get("hour") or 3) and now.minute == int(settings.get("minute") or 0):
            try:
                await run_improvement_job(trigger="schedule", actor_id="worker")
            except Exception:
                await asyncio.sleep(60)


def main():
    asyncio.run(loop())


if __name__ == "__main__":
    main()
