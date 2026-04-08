from pathlib import Path
from dotenv import load_dotenv

# 永遠讀到「專案根目錄」的 .env（不管你在哪裡啟動 uvicorn）
env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from student_api import router as student_router
from db import fetch_one
from azure_openai import azure_chat
from mongo_db import get_client, get_db,ping_mongo



app = FastAPI(title="HuggingChat Dashboard API")
app.include_router(student_router)
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5174")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeReq(BaseModel):
    prompt: str

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/overview")
def overview():
    try:
        row = fetch_one("SELECT COUNT(*) AS user_count FROM mdl_user;")
        return {"user_count": row["user_count"] if row else None}
    except Exception as e:
        # 開發期先把錯誤丟回來，方便你定位（上線再拿掉）
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze")
async def analyze(req: AnalyzeReq):
    text = await azure_chat(req.prompt)
    return {"text": text}

@app.get("/api/mongo/databases")
async def mongo_databases():
    client = get_client()
    dbs = await client.list_database_names()
    return {"databases": dbs}

@app.get("/api/mongo/ping")
async def mongo_ping():
    try:
        return await ping_mongo()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

    # URL 可能帶符號，保險先抽數字
    digits = re.sub(r"\D", "", hfUserId or "")
    if not digits:
        raise HTTPException(status_code=400, detail="Invalid user id")

    user_id = int(digits)

    # ✅ 最安全做法：fetch_one 支援參數化
    # row = fetch_one(
    #   "SELECT firstname, lastname, email FROM mdl_user WHERE id=%s",
    #   (user_id,)
    # )

    # ✅ 如果你目前 fetch_one 不支援 params：因為我們已經 int()，也不會注入
    row = fetch_one(f"SELECT firstname, lastname, email FROM mdl_user WHERE id = {user_id}")

    if not row:
        raise HTTPException(status_code=404, detail="Moodle user not found")

    return {
        "firstname": row.get("firstname"),
        "lastname": row.get("lastname"),
        "email": row.get("email"),
        "id": user_id,
    }

