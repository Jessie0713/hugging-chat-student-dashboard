#!/usr/bin/env python3
"""
將新制恐龍探險獎章 upsert 至 Mongo `badges` collection。
同時停用舊制獎章 id，避免 API 混用兩套定義。

用法（在 backend/ 目錄）：
  python scripts/seed_badges.py
  python scripts/seed_badges.py --source rolling_level
  python scripts/seed_badges.py --source fixed_level
  python scripts/seed_badges.py --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

# 讓 `from course_score import ...` 在 scripts/ 下可執行
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv

load_dotenv(BACKEND_DIR.parent / ".env")
load_dotenv(BACKEND_DIR / ".env")

from course_score import DEFAULT_BADGE_DEFINITIONS  # noqa: E402
from mongo_db import get_db_by_source, normalize_source  # noqa: E402

GRADE_NOTE_BY_ID: dict[str, str] = {
    "egg_hatch": "0 分",
    "milestone_topics_2": "累計 30 分",
    "milestone_topics_4": "累計 50 分",
    "milestone_topics_6": "累計 60 分",
    "milestone_topics_8": "累計 80 分",
    "kaiju_guardian": "守護神獸 20 分",
    "srl_reflect": "額外加成來源",
}

# 舊 Dashboard / Chat UI 恐龍獎章（新制已取代）
LEGACY_BADGE_IDS = [
    "first_nest",
    "flyer_observe",
    "trail_five",
    "armor_ready",
    "rex_ten",
    "kaiju_six",
    "topics_5",
    "topics_6",
    "topics_7",
    "effective_round",
    "advanced_cert",
]


def badge_to_mongo_doc(defn: dict) -> dict:
    bid = defn["id"]
    unlock = defn.get("unlock") or ""
    doc = {
        "id": bid,
        "name": defn.get("name") or bid,
        "meaning": defn.get("meaning") or "",
        "unlock": unlock,
        "unlockText": unlock,
        "iconUrl": defn.get("iconUrl") or "",
        "ruleType": defn.get("ruleType") or "completed_topics",
        "threshold": int(defn.get("threshold") or 0),
        "sortOrder": int(defn.get("sortOrder") or 0),
        "enabled": True,
        "phase": "course_v2",
        "gradeNote": GRADE_NOTE_BY_ID.get(bid),
        "updatedAt": datetime.now(timezone.utc),
    }
    if isinstance(defn.get("meta"), dict):
        doc["meta"] = defn["meta"]
    if defn.get("scoreValue") is not None:
        doc["scoreValue"] = defn["scoreValue"]
    return doc


async def seed_source(source: str, dry_run: bool = False) -> dict:
    src = normalize_source(source)
    db = get_db_by_source(src)
    coll = db["badges"]
    now = datetime.now(timezone.utc)

    upserted: list[str] = []
    disabled: list[str] = []

    for defn in DEFAULT_BADGE_DEFINITIONS:
        bid = defn["id"]
        doc = badge_to_mongo_doc(defn)
        if dry_run:
            upserted.append(bid)
            continue
        await coll.update_one(
            {"id": bid},
            {
                "$set": doc,
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
        upserted.append(bid)

    for legacy_id in LEGACY_BADGE_IDS:
        if dry_run:
            disabled.append(legacy_id)
            continue
        result = await coll.update_one(
            {"id": legacy_id},
            {
                "$set": {
                    "enabled": False,
                    "deprecated": True,
                    "replacedByPhase": "course_v2",
                    "updatedAt": now,
                }
            },
        )
        if result.matched_count:
            disabled.append(legacy_id)

    active_count = await coll.count_documents(
        {"enabled": {"$ne": False}, "phase": "course_v2"}
    )

    return {
        "source": src,
        "db": db.name,
        "upserted": upserted,
        "disabled_legacy": disabled,
        "active_v2_count": active_count,
        "dry_run": dry_run,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Mongo badges (course v2)")
    parser.add_argument(
        "--source",
        choices=["rolling_level", "fixed_level", "all"],
        default="all",
        help="Which Mongo DB to update (default: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions without writing to Mongo",
    )
    args = parser.parse_args()

    sources = (
        ["rolling_level", "fixed_level"]
        if args.source == "all"
        else [args.source]
    )

    results = []
    for src in sources:
        print(f"\n=== {src} ===")
        try:
            result = await seed_source(src, dry_run=args.dry_run)
            results.append(result)
            print(f"  db: {result['db']}")
            print(f"  upserted ({len(result['upserted'])}): {', '.join(result['upserted'])}")
            if result["disabled_legacy"]:
                print(f"  disabled legacy: {', '.join(result['disabled_legacy'])}")
            else:
                print("  disabled legacy: (none matched)")
            if not args.dry_run:
                print(f"  active course_v2 badges: {result['active_v2_count']}")
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            raise

    print("\nDone." if not args.dry_run else "\nDry run complete (no writes).")


if __name__ == "__main__":
    asyncio.run(main())
