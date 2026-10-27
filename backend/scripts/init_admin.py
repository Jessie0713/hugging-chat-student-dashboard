#!/usr/bin/env python3
"""以伺服器端環境變數建立管理者，不開放自行註冊。"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from assistant_auth import hash_password
from assistant_store import col, ensure_indexes, utcnow


async def main() -> None:
    username = (os.getenv("DASHBOARD_ADMIN_USERNAME") or "").strip()
    password = os.getenv("DASHBOARD_ADMIN_PASSWORD") or ""
    if not username or not password:
        raise SystemExit("請在環境變數設定 DASHBOARD_ADMIN_USERNAME 與 DASHBOARD_ADMIN_PASSWORD")
    await ensure_indexes()
    hashed = hash_password(password)
    await col("admins").update_one(
        {"username": username},
        {"$set": {
            "username": username,
            "passwordHash": hashed,
            "updatedAt": utcnow(),
        }, "$setOnInsert": {"createdAt": utcnow()}},
        upsert=True,
    )
    print(f"admin ready: {username}")


if __name__ == "__main__":
    asyncio.run(main())
