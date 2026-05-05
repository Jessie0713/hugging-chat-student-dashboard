import os
import atexit
import threading
from motor.motor_asyncio import AsyncIOMotorClient
from sshtunnel import SSHTunnelForwarder

_lock = threading.Lock()
_clients: dict[str, AsyncIOMotorClient] = {}
_tunnels: dict[str, SSHTunnelForwarder] = {}

def _get_m7_client() -> AsyncIOMotorClient:
    uri = os.getenv("MONGO_URI", "mongodb://localhost:27018")
    return AsyncIOMotorClient(uri, serverSelectionTimeoutMS=3000)

def _get_huggingchat_tunnel() -> SSHTunnelForwarder:
    host = os.getenv("HUGGINGCHAT_SSH_HOST", "").strip()
    port = int(os.getenv("HUGGINGCHAT_SSH_PORT", "22"))
    user = os.getenv("HUGGINGCHAT_SSH_USER", "").strip()
    password = os.getenv("HUGGINGCHAT_SSH_PASS", "")

    remote_host = os.getenv("HUGGINGCHAT_REMOTE_DB_HOST", "127.0.0.1").strip()
    remote_port = int(os.getenv("HUGGINGCHAT_REMOTE_DB_PORT", "27017"))

    if not host or not user or not password:
        raise RuntimeError(
            "Missing huggingchat SSH env vars. Required: "
            "HUGGINGCHAT_SSH_HOST, HUGGINGCHAT_SSH_USER, HUGGINGCHAT_SSH_PASS"
        )

    tunnel = SSHTunnelForwarder(
        (host, port),
        ssh_username=user,
        ssh_password=password,
        remote_bind_address=(remote_host, remote_port),
        local_bind_address=("127.0.0.1", 0),
    )
    tunnel.start()
    return tunnel

def _get_huggingchat_client(tunnel: SSHTunnelForwarder) -> AsyncIOMotorClient:
    uri = f"mongodb://127.0.0.1:{tunnel.local_bind_port}"
    return AsyncIOMotorClient(uri, serverSelectionTimeoutMS=3000)

def _close_all():
    with _lock:
        for client in _clients.values():
            try:
                client.close()
            except Exception:
                pass

        for tunnel in _tunnels.values():
            try:
                tunnel.stop()
            except Exception:
                pass

        _clients.clear()
        _tunnels.clear()

atexit.register(_close_all)

def get_client_by_source(source: str) -> AsyncIOMotorClient:
    """
    Return a cached Motor client for a given source.

    Supported sources:
    - m7: uses MONGO_URI
    - huggingchat: uses SSH tunnel to remote 127.0.0.1:27017 then connects locally
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
            tunnel = _get_huggingchat_tunnel()
            client = _get_huggingchat_client(tunnel)
            _tunnels[src] = tunnel
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
        db_name = os.getenv("HUGGINGCHAT_MONGO_DB_NAME", "chat-ui")
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
