# HuggingChat Dashboard

學生英文口說學習儀表板（前端 React + Vite / 後端 FastAPI），可查看學生 overview、對話紀錄、徽章等資訊，並支援以 AI 產生學習建議。

## 快速開始（本機啟動）

### 0) 先準備 `.env`（放在專案根目錄）

後端會**固定讀取專案根目錄**的 `.env`（見 `backend/main.py`），不管你從哪個資料夾啟動。

建立 `./.env`，至少需要：

```bash
# CORS: 允許前端開發站台呼叫後端
FRONTEND_ORIGIN=http://localhost:5174

# Mongo — rolling_level（滾動式調整系統，舊 m7 / chat-ui）
ROLLING_LEVEL_MONGO_URI=mongodb://<host>:<port>
ROLLING_LEVEL_MONGO_DB=chat-ui

# Mongo — fixed_level（固定等級系統，舊 huggingchat / chat-ui-control）
FIXED_LEVEL_MONGO_URI=mongodb://<host>:<port>
FIXED_LEVEL_MONGO_DB=chat-ui-control

# Moodle MySQL - Double SSH tunnel（見 backend/db.py）
SSH1_HOST=
SSH1_PORT=22
SSH1_USER=
SSH1_PASS=
SSH2_HOST=
SSH2_PORT=22
SSH2_USER=
SSH2_PASS=
DB_HOST_API=
DB_PORT_API=3306
DB_USER_API=
DB_PASS_API=
DB_NAME_API=

# Azure OpenAI（可選；未設定會回 "Azure OpenAI env not set."）
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_KEY=
AZURE_OPENAI_DEPLOYMENT_NAME=
AZURE_OPENAI_API_VERSION=
```

### 1) 啟動後端（FastAPI, port 8000）

```bash
cd backend
python -m venv .venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

確認健康檢查：

- `GET /api/health` → `{"status":"ok"}`

### 2) 啟動前端（Vite, port 5174）

```bash
cd frontend
npm install
npm run dev
```

前端預設跑在 `http://localhost:5174`。

## 使用方式

### 測試帳號

- **hfUserId（測試帳號）**: `2481643`

### 前端路由

前端使用 React Router，學生頁面路由如下（見 `frontend/src/App.jsx`）：

- `/`：首頁（輸入 source / hfUserId）
- `/:source/student/:hfUserId/overview`：總覽
- `/:source/student/:hfUserId/conversations`：對話
- `/:source/student/:hfUserId/badges`：徽章

`source` 目前支援（見 `backend/mongo_db.py`）：

- `rolling_level`（滾動式調整系統）：`ROLLING_LEVEL_MONGO_URI` / `ROLLING_LEVEL_MONGO_DB`（預設 database `chat-ui`）
- `fixed_level`（固定等級系統）：`FIXED_LEVEL_MONGO_URI` / `FIXED_LEVEL_MONGO_DB`（預設 database `chat-ui-control`）

舊名稱仍相容：`m7` → `rolling_level`、`huggingchat` → `fixed_level`；環境變數亦相容 `MONGO_URI` / `HUGGINGCHAT_MONGO_URI` 等。

範例（測試帳號）：

- `/rolling_level/student/2481643/overview`

## 專案架構

### 前端（`frontend/`）

- **技術**: React + Vite + MUI
- **開發埠**: 5174（見 `frontend/package.json`、`frontend/vite.config.js`）
- **API 呼叫**:
  - `frontend/src/lib/api.js` 會使用 `http(s)://<hostname>:8000` 當作 API base
  - `frontend/vite.config.js` 也有設定 `/api` proxy 到 `http://localhost:8000`

主要目錄：

- `frontend/src/pages/`：頁面（`OverviewPage.jsx`, `Conversations.jsx`, `Badges.jsx`…）
- `frontend/src/components/`：共用元件（例如 `Header.jsx`）
- `frontend/src/lib/api.js`：呼叫後端 API 的封裝

### 後端（`backend/`）

- **技術**: FastAPI + Uvicorn
- **埠**: 8000
- **入口**: `backend/main.py`
- **路由**:
  - `backend/student_api.py`：學生相關 API（prefix: `/api/{source}/student`）

資料來源：

- **Mongo（Motor）**: `backend/mongo_db.py`
  - `rolling_level`：`ROLLING_LEVEL_MONGO_URI` / `ROLLING_LEVEL_MONGO_DB`
  - `fixed_level`：`FIXED_LEVEL_MONGO_URI` / `FIXED_LEVEL_MONGO_DB`
- **Moodle MySQL（PyMySQL）**: `backend/db.py`
  - 使用 **Double SSH tunnel** 方式連到 DB（環境變數 `SSH1_*`, `SSH2_*`, `DB_*_API`）
- **Azure OpenAI**: `backend/azure_openai.py`
  - 若 `.env` 沒設齊，API 仍可啟動，但 AI 分析會回固定文字

## 常用 API（節錄）

- `GET /api/health`
- `GET /api/{source}/student/{hfUserId}/overview`
- `GET /api/{source}/student/{hfUserId}/conversations?skip=0&limit=20`
- `GET /api/{source}/student/{hfUserId}/badges`
- `POST /api/{source}/student/{hfUserId}/ai-advice`
- `GET /api/{source}/mongo/ping`

## Docker（後端）

後端有 `backend/Dockerfile`（預設啟動 `uvicorn main:app --port 8000`）。如需使用 Docker，請確保你會把專案根目錄 `.env` 掛載/注入到容器中。

