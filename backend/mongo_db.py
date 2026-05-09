import os
import atexit
import threading
from motor.motor_asyncio import AsyncIOMotorClient

_lock = threading.Lock()
_clients: dict[str, AsyncIOMotorClient] = {}


def _get_m7_client() -> AsyncIOMotorClient:
    uri = os.getenv("MONGO_URI", "mongodb://localhost:27018")
    return AsyncIOMotorClient(uri, serverSelectionTimeoutMS=3000)


def _get_huggingchat_client() -> AsyncIOMotorClient:
    uri = os.getenv("HUGGINGCHAT_MONGO_URI", "mongodb://localhost:27018")
    return AsyncIOMotorClient(uri, serverSelectionTimeoutMS=3000)


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
    - m7: uses MONGO_URI (default mongodb://localhost:27018)
    - huggingchat: uses HUGGINGCHAT_MONGO_URI (default mongodb://localhost:27018)
    """
    src = (source or "").strip().lower()
    if not src:
        raise RuntimeError("source is required")

    with _lock:
        if src in _clients:
            return _clients[src]

        if src == "m7":
            client = _get_m7_client()
            _clients[src] = client
            return client

        if src == "huggingchat":
            client = _get_huggingchat_client()
            _clients[src] = client
            return client

    raise RuntimeError(f"Unknown source: {source}")


def get_db():
    # 你確定要用 chat-ui，就給預設值，避免忘記設 MONGO_DB 直接報錯
    db_name = os.getenv("MONGO_DB", "chat-ui")
    return get_client_by_source("m7")[db_name]


def get_db_by_source(source: str):
    src = (source or "").strip().lower()
    if src == "m7":
        db_name = os.getenv("MONGO_DB", "chat-ui")
        return get_client_by_source("m7")[db_name]
    if src == "huggingchat":
        db_name = (
            os.getenv("HUGGINGCHAT_MONGO_DB_NAME")
            or os.getenv("EXP_MONGO_DB_NAME")
            or "chat-ui-control"
        )
        return get_client_by_source("huggingchat")[db_name]

    raise RuntimeError(f"Unknown source: {source}")


async def ping_mongo_by_source(source: str) -> dict:
    """
    真正的連線測試：會對 admin 發 ping，並回傳 collections 數量、conversations 筆數
    """
    client = get_client_by_source(source)
    await client.admin.command("ping")

    db = get_db_by_source(source)
    cols = await db.list_collection_names()
    conv_count = await db["conversations"].count_documents({})

    return {
        "ok": True,
        "source": (source or "").strip().lower(),
        "db": db.name,
        "collections": len(cols),
        "conversations": conv_count,
    }


async def ping_mongo() -> dict:
    """
    真正的連線測試：會對 admin 發 ping，並回傳 collections 數量、conversations 筆數
    """
    return await ping_mongo_by_source("m7")
