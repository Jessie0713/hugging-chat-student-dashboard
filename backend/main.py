from pathlib import Path
from dotenv import load_dotenv

# 永遠讀到「專案根目錄」的 .env（不管你在哪裡啟動 uvicorn）
env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from student_api import router as student_router
from cefr_api import router as cefr_router
from teacher_api import router as teacher_router
from assistant_api import router as assistant_router
from mongo_db import ping_mongo_by_source


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from assistant_store import ensure_indexes
        await ensure_indexes()
    except Exception:
        pass
    yield


app = FastAPI(title="HuggingChat Dashboard API", lifespan=lifespan)
app.include_router(student_router)
app.include_router(cefr_router)
app.include_router(teacher_router)
app.include_router(assistant_router)
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


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/{source}/mongo/ping")
async def mongo_ping(source: str):
    try:
        return await ping_mongo_by_source(source)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

