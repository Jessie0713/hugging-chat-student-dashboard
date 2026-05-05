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
from cefr_api import router as cefr_router
from db import fetch_one
from azure_openai import azure_chat
from mongo_db import get_client_by_source, ping_mongo_by_source



app = FastAPI(title="HuggingChat Dashboard API")
app.include_router(student_router)
app.include_router(cefr_router)
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5174")
frontend_origins = [x.strip() for x in frontend_origin.split(",") if x.strip()]
if not frontend_origins:
    frontend_origins = ["http://localhost:5174"]

# Dev-friendly defaults: allow common local ports/hosts without editing .env
for extra in (
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
):
    if extra not in frontend_origins:
        frontend_origins.append(extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
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

@app.get("/api/{source}/mongo/databases")
async def mongo_databases(source: str):
    client = get_client_by_source(source)
    dbs = await client.list_database_names()
    return {"source": (source or "").strip().lower(), "databases": dbs}

@app.get("/api/{source}/mongo/ping")
async def mongo_ping(source: str):
    try:
        return await ping_mongo_by_source(source)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

