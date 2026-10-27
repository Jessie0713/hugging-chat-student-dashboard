# backend/assistant_coding.py
"""程式改版 runner／部署 adapter。沒有外部憑證時維持 blocked，不得顯示已部署。"""
from __future__ import annotations

import os
from typing import Any

from assistant_store import utcnow

AUTO_ALLOWED_PATHS = (
    "backend/knowledge/",
    "frontend/src/components/GradeReviewPanel.jsx",
    "frontend/src/components/AssistantPanel.jsx",
)

FORBIDDEN_AUTO = (
    "identity",
    "auth",
    "score",
    "grade",
    "migration",
    "requirements",
    "docker",
    "deploy",
)


def runner_config() -> dict[str, Any]:
    return {
        "gitRemote": os.getenv("DASHBOARD_CODE_GIT_REMOTE") or "",
        "ciTokenSet": bool(os.getenv("DASHBOARD_CODE_CI_TOKEN")),
        "previewUrl": os.getenv("DASHBOARD_CODE_PREVIEW_URL") or "",
        "worktree": os.getenv("DASHBOARD_CODE_WORKTREE") or "",
    }


def classify_code_task(title: str, paths: list[str]) -> dict[str, Any]:
    blob = " ".join([title or ""] + paths).lower()
    if any(k in blob for k in FORBIDDEN_AUTO):
        return {
            "autoAllowed": False,
            "reason": "身分權限、成績公式、評級、migration、依賴或部署設定需人工開發審查",
        }
    if paths and not all(any(p.startswith(a) for a in AUTO_ALLOWED_PATHS) for p in paths):
        return {"autoAllowed": False, "reason": "超出首版自動修正範圍（說明文字／已界定 UI）"}
    return {"autoAllowed": True, "reason": ""}


async def run_coding_job(task: dict[str, Any]) -> dict[str, Any]:
    cfg = runner_config()
    classification = classify_code_task(task.get("title") or "", task.get("paths") or [])
    if not classification["autoAllowed"]:
        return {
            "status": "blocked",
            "published": False,
            "message": classification["reason"],
            "at": utcnow().isoformat(),
        }
    missing = []
    if not cfg["gitRemote"]:
        missing.append("DASHBOARD_CODE_GIT_REMOTE")
    if not cfg["ciTokenSet"]:
        missing.append("DASHBOARD_CODE_CI_TOKEN")
    if missing:
        return {
            "status": "blocked",
            "published": False,
            "message": "缺少 coding runner／CI 設定：" + ", ".join(missing),
            "missing": missing,
            "at": utcnow().isoformat(),
        }
    # 有憑證時仍不在此直接部署正式環境
    return {
        "status": "blocked",
        "published": False,
        "message": "已接上遠端設定，但目前只授權本地預覽，未執行正式部署。",
        "previewUrl": cfg["previewUrl"] or None,
        "at": utcnow().isoformat(),
    }
