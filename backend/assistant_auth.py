# backend/assistant_auth.py
"""儀表板助手／管理權限。不信任前端傳來的角色或 hfUserId。"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Header, HTTPException

ROLES = ("public", "student", "teacher", "admin")
STUDENT_ISSUE_HEADER = "X-Student-Issue-Secret"
ADMIN_COLLECTION = "dashboard_admins"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode((text + pad).encode("ascii"))


def auth_secret() -> str:
    return (os.getenv("DASHBOARD_AUTH_SECRET") or "").strip()


def student_issue_secret() -> str:
    return (os.getenv("DASHBOARD_STUDENT_ISSUE_SECRET") or "").strip()


def teacher_access_code() -> str:
    return (os.getenv("TEACHER_ACCESS_CODE") or "111111").strip()


def token_ttl_hours() -> int:
    try:
        return max(1, int(os.getenv("DASHBOARD_AUTH_TTL_HOURS") or "12"))
    except ValueError:
        return 12


def public_actor() -> dict[str, Any]:
    return {
        "role": "public",
        "actorId": "public",
        "source": None,
        "tokenId": None,
    }


def sign_token(payload: dict[str, Any]) -> str:
    secret = auth_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="未設定 DASHBOARD_AUTH_SECRET，無法核發登入狀態")
    body = _b64url(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    sig = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{_b64url(sig)}"


def verify_token(token: str) -> dict[str, Any]:
    secret = auth_secret()
    if not secret:
        raise HTTPException(status_code=401, detail="未設定驗證密鑰")
    try:
        body, sig = (token or "").split(".", 1)
        expected = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64url_decode(sig)):
            raise ValueError("bad sig")
        payload = json.loads(_b64url_decode(body).decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=401, detail="登入狀態無效") from e
    exp = payload.get("exp")
    now = datetime.now(timezone.utc).timestamp()
    if not exp or float(exp) < now:
        raise HTTPException(status_code=401, detail="登入已過期")
    role = payload.get("role")
    if role not in ("student", "teacher", "admin"):
        raise HTTPException(status_code=401, detail="角色無效")
    return payload


def issue_session(*, role: str, actor_id: str, source: str | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    payload = {
        "role": role,
        "actorId": str(actor_id),
        "source": source,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=token_ttl_hours())).timestamp()),
        "jti": secrets.token_hex(8),
    }
    token = sign_token(payload)
    return {"token": token, "actor": {
        "role": role,
        "actorId": payload["actorId"],
        "source": source,
        "tokenId": payload["jti"],
        "expiresAt": datetime.fromtimestamp(payload["exp"], tz=timezone.utc).isoformat(),
    }}


def hash_password(password: str, salt_hex: str | None = None) -> str:
    salt_b = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_b, 120000)
    return f"{salt_b.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        salt_b = bytes.fromhex(salt_hex)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_b, 120000)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


def actor_from_authorization(authorization: str | None) -> dict[str, Any]:
    raw = (authorization or "").strip()
    if not raw:
        return public_actor()
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    payload = verify_token(raw)
    return {
        "role": payload["role"],
        "actorId": str(payload.get("actorId") or ""),
        "source": payload.get("source"),
        "tokenId": payload.get("jti"),
    }


async def get_actor(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    return actor_from_authorization(authorization)


def require_roles(actor: dict[str, Any], *roles: str) -> dict[str, Any]:
    if actor.get("role") not in roles:
        raise HTTPException(status_code=401, detail="需要登入後才能查個人或班級資料")
    return actor


def require_admin(actor: dict[str, Any]) -> dict[str, Any]:
    if actor.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理者權限")
    return actor


def require_teacher_or_admin(actor: dict[str, Any]) -> dict[str, Any]:
    if actor.get("role") not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="需要教師或管理者權限")
    return actor


def student_source_or_401(actor: dict[str, Any], requested: str | None = None) -> str:
    require_roles(actor, "student")
    src = actor.get("source")
    if not src:
        raise HTTPException(status_code=403, detail="學生工作階段缺少資料來源")
    if requested and requested != src:
        raise HTTPException(status_code=403, detail="不可改查另一組資料來源")
    return src


def bound_hf_user_id(actor: dict[str, Any]) -> str:
    require_roles(actor, "student")
    hf = str(actor.get("actorId") or "").strip()
    if not hf:
        raise HTTPException(status_code=403, detail="學生工作階段缺少身分")
    return hf
