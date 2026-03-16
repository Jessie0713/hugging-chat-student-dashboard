import os
from motor.motor_asyncio import AsyncIOMotorClient

_client = None

def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        uri = os.getenv("MONGO_URI", "mongodb://localhost:27018")
        _client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=3000)
    return _client

def get_db():
    # 你確定要用 chat-ui，就給預設值，避免忘記設 MONGO_DB 直接報錯
    db_name = os.getenv("MONGO_DB", "chat-ui")
    return get_client()[db_name]

async def ping_mongo() -> dict:
    """
    真正的連線測試：會對 admin 發 ping，並回傳 collections 數量、conversations 筆數
    """
    client = get_client()
    # 這行會真的去連線（連不到會丟錯）
    await client.admin.command("ping")

    db = get_db()
    cols = await db.list_collection_names()
    conv_count = await db["conversations"].count_documents({})

    return {
        "ok": True,
        "db": db.name,
        "collections": len(cols),
        "conversations": conv_count,
    }
