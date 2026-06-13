import os
import atexit
import threading
from motor.motor_asyncio import AsyncIOMotorClient

_lock = threading.Lock()
_clients: dict[str, AsyncIOMotorClient] = {}

# 舊 URL / 環境變數相容（m7、huggingchat）
SOURCE_ALIASES = {
    "m7": "rolling_level",
    "huggingchat": "fixed_level",
}


def normalize_source(source: str) -> str:
    src = (source or "").strip().lower()
    if not src:
        raise RuntimeError("source is required")
    return SOURCE_ALIASES.get(src, src)


def _mongo_uri_from_env(*env_keys: str, source_label: str) -> str:
    for key in env_keys:
        val = os.getenv(key)
        if val and val.strip():
            return val.strip()
    keys = ", ".join(env_keys)
    raise RuntimeError(
        f"MongoDB URI not configured for {source_label}. "
        f"Set one of: {keys}"
    )


def _rolling_level_uri() -> str:
    return _mongo_uri_from_env(
        "ROLLING_LEVEL_MONGO_URI",
        "MONGO_URI",
        source_label="rolling_level",
    )


def _fixed_level_uri() -> str:
    return _mongo_uri_from_env(
        "FIXED_LEVEL_MONGO_URI",
        "HUGGINGCHAT_MONGO_URI",
        source_label="fixed_level",
    )


def _rolling_level_db_name() -> str:
    return os.getenv("ROLLING_LEVEL_MONGO_DB") or os.getenv("MONGO_DB", "chat-ui")


def _fixed_level_db_name() -> str:
    return (
        os.getenv("FIXED_LEVEL_MONGO_DB")
        or os.getenv("HUGGINGCHAT_MONGO_DB_NAME")
        or os.getenv("EXP_MONGO_DB_NAME")
        or "chat-ui-control"
    )


def _get_rolling_level_client() -> AsyncIOMotorClient:
    return AsyncIOMotorClient(_rolling_level_uri(), serverSelectionTimeoutMS=3000)


def _get_fixed_level_client() -> AsyncIOMotorClient:
    return AsyncIOMotorClient(_fixed_level_uri(), serverSelectionTimeoutMS=3000)


def _close_all():
    with _lock:
        for client in _clients.values():
            try:
                client.close()
            except Exception:
                pass

        _clients.clear()


atexit.register(_close_all)


def get_client_by_source(source: str) -> AsyncIOMotorClient:
    """
    Return a cached Motor client for a given source.

    Supported sources:
    - rolling_level: ROLLING_LEVEL_MONGO_URI (fallback MONGO_URI)
    - fixed_level: FIXED_LEVEL_MONGO_URI (fallback HUGGINGCHAT_MONGO_URI)

    Legacy aliases: m7 -> rolling_level, huggingchat -> fixed_level
    """
    src = normalize_source(source)

    with _lock:
        if src in _clients:
            return _clients[src]

        if src == "rolling_level":
            client = _get_rolling_level_client()
            _clients[src] = client
            return client

        if src == "fixed_level":
            client = _get_fixed_level_client()
            _clients[src] = client
            return client

    raise RuntimeError(f"Unknown source: {source}")


def get_db():
    db_name = _rolling_level_db_name()
    return get_client_by_source("rolling_level")[db_name]


def get_db_by_source(source: str):
    src = normalize_source(source)
    if src == "rolling_level":
        return get_client_by_source("rolling_level")[_rolling_level_db_name()]
    if src == "fixed_level":
        return get_client_by_source("fixed_level")[_fixed_level_db_name()]

    raise RuntimeError(f"Unknown source: {source}")


async def ping_mongo_by_source(source: str) -> dict:
    """
    真正的連線測試：會對 admin 發 ping，並回傳 collections 數量、conversations 筆數
    """
    src = normalize_source(source)
    client = get_client_by_source(src)
    await client.admin.command("ping")

    db = get_db_by_source(src)
    cols = await db.list_collection_names()
    conv_count = await db["conversations"].count_documents({})

    return {
        "ok": True,
        "source": src,
        "db": db.name,
        "collections": len(cols),
        "conversations": conv_count,
    }


async def ping_mongo() -> dict:
    """
    真正的連線測試：會對 admin 發 ping，並回傳 collections 數量、conversations 筆數
    """
    return await ping_mongo_by_source("rolling_level")
