# backend/student_api.py
from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from collections import Counter, defaultdict
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId

from mongo_db import get_db
from db import fetch_one  # 你已經有 Moodle 的連線工具
from azure_openai import azure_chat
router = APIRouter(prefix="/api/student", tags=["student"])
def normalize_hf_user_id(hf_user_id: str) -> str:
    return (hf_user_id or "").strip()

async def find_user_by_hf_user_id(db, hf_user_id: str) -> dict | None:
    hf_user_id = normalize_hf_user_id(hf_user_id)

    # 1) exact match
    doc = await db["users"].find_one({"hfUserId": hf_user_id})
    if doc:
        return doc

    # 2) numeric-ish match（有些 DB 可能存 int）
    if hf_user_id.isdigit():
        doc = await db["users"].find_one({"hfUserId": int(hf_user_id)})
        if doc:
            return doc

    # 3) tolerant match: "154708," or whitespace
    safe = re.escape(hf_user_id)
    doc = await db["users"].find_one(
        {"hfUserId": {"$regex": rf"^{safe}\s*,?\s*$"}}
    )
    return doc
@router.get("/{hfUserId}/header")
async def header(hfUserId: str):
    db = get_db()
    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(404, "User not found in Mongo users")

    user_oid = user["_id"]
    conv_count = await db["conversations"].count_documents({"userId": user_oid})

    latest = await db["conversations"].find({"userId": user_oid}).sort([("updatedAt", -1)]).limit(1).to_list(1)
    latest_updated_at = latest[0].get("updatedAt") if latest else None

    return {
        "hfUserId": str(user.get("hfUserId")),
        "mongoUserId": str(user_oid),
        "createdAt": user.get("createdAt"),
        "updatedAt": user.get("updatedAt"),
        "conversationCount": conv_count,
        "latestConversationAt": latest_updated_at,
    }


    db = get_db()
    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(404, "User not found")

    user_oid = user["_id"]

    # CEFR 分佈（從 users.agentCefr 來）
    agent_cefr = user.get("agentCefr", []) or []
    dist = {}
    per_assistant = []
    for item in agent_cefr:
        lvl = item.get("levelKey")
        if lvl:
            dist[lvl] = dist.get(lvl, 0) + 1
        per_assistant.append({
            "assistantId": str(item.get("assistantId")) if item.get("assistantId") else None,
            "levelKey": item.get("levelKey"),
            "nextLevelKey": item.get("nextLevelKey") or (item.get("progressByConversation") or {}).get("nextLevelKey"),
            "confidence": (item.get("advice") or {}).get("confidence"),
            "updatedAt": item.get("updatedAt"),
        })

    # 對話總覽（conversations）
    conv_count = await db["conversations"].count_documents({"userId": user_oid})
    # 取最近 50 筆估算訊息數/字數（MVP 先這樣，避免一次拉爆）
    recent = await (
        db["conversations"]
        .find({"userId": user_oid}, {"messages": 1, "updatedAt": 1, "assistantId": 1, "model": 1})
        .sort([("updatedAt", -1)])
        .limit(50)
        .to_list(50)
    )

    total_msgs = 0
    total_chars = 0
    assistant_dist = {}
    for c in recent:
        msgs = c.get("messages", []) or []
        total_msgs += len(msgs)
        for m in msgs:
            content = m.get("content") or ""
            total_chars += len(content)
        aid = str(c.get("assistantId")) if c.get("assistantId") else "unknown"
        assistant_dist[aid] = assistant_dist.get(aid, 0) + 1

    return {
        "hfUserId": str(user.get("hfUserId")),
        "cefrDistribution": dist,          # 例如 {"A1":2,"A2":1}
        "cefrByAssistant": per_assistant,  # 每個 assistant 的 level
        "conversationCount": conv_count,
        "recentSampledConversations": len(recent),
        "recentTotalMessages": total_msgs,
        "recentTotalChars": total_chars,
        "assistantUsageTop": sorted(assistant_dist.items(), key=lambda x: x[1], reverse=True)[:5],
    }

# backend/student_api.py (Partial Update)

# ... (保留原本的 imports)
# 確保有 import build_assistant_name_map
# from student_api import build_assistant_name_map (如果在同檔案最後面有定義，則直接呼叫)


@router.post("/{hfUserId}/ai-advice")
async def ai_advice(hfUserId: str):
    """
    你想要「點了才分析」：就用 POST 觸發。
    MVP：把 overview 摘要丟給 Azure OpenAI 產出建議
    """
    # [修正 1] 這裡原本寫 overview(hfUserId)，但你的函式叫 student_overview
    try:
        ov = await student_overview(hfUserId)
    except Exception as e:
        return {"text": f"無法取得數據: {str(e)}"}

    # [建議] 稍微過濾一下資料，避免把 timeseries 等太長的資料丟給 AI 浪費 Token
    prompt_data = {
        "stats": ov.get("stats"),
        "top_assistants": ov.get("assistantUsage", [])[:5],
        "cefr_level": ov.get("cefrGroups")
    }

    prompt = f"""
你是一個英文口說學習教練。請根據以下學生的整體資料，給 5 點可執行建議：
- 建議要具體：包含「下一次對話要怎麼做」「要練什麼句型/策略」「注意什麼常見問題」
- 也請給一個簡短的本週練習計畫（3 天）。
資料如下（JSON）：
{prompt_data}
""".strip()

    # [修正 2] 確保上面有 import azure_chat，這裡才能運作
    try:
        text = await azure_chat(prompt)
        return {"text": text}
    except Exception as e:
        return {"text": f"AI 分析發生錯誤: {str(e)}"}

@router.get("/{hfUserId}/badges")
async def badges(hfUserId: str):
    # 先回空；你之後可以建 collection: userBadges
    return {"hfUserId": hfUserId, "badges": []}
# backend/student_api.py

@router.get("/{hfUserId}/conversations")
async def conversations(hfUserId: str, skip: int = 0, limit: int = Query(20, ge=1, le=100)):
    db = get_db()
    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(404, "User not found")
    user_oid = user["_id"]

    # 1. 查詢 DB (注意：這裡不能有 {"messages": 0})
    cursor = (
        db["conversations"]
        .find({"userId": user_oid})  # <--- 修正了這裡！原本有 {"messages": 0}
        .sort([("updatedAt", -1), ("_id", -1)])
        .skip(skip)
        .limit(limit)
    )
    items = await cursor.to_list(limit)

    # 2. 收集 ID 用來查名字
    assistant_ids = []
    for x in items:
        x["_id"] = str(x["_id"])
        x["userId"] = str(x.get("userId")) if x.get("userId") else None
        raw_messages = x.get("messages", []) or []
        x["messages"] = [
            m for m in raw_messages
            if m.get("from") in ("user", "assistant")
            and (m.get("content") or "").strip()
        ]
        aid = x.get("assistantId")
        if aid:
            x["assistantId"] = str(aid)
            assistant_ids.append(aid)
        else:
            x["assistantId"] = None

    # 3. 查名字表
    name_map = await build_assistant_name_map(db, assistant_ids)

    # 4. 組裝結果 (注入 assistantName)
    for x in items:
        aid = x.get("assistantId")
        x["assistantName"] = name_map.get(aid, "Unknown Assistant")



    total = await db["conversations"].count_documents({"userId": user_oid})
    return {"total": total, "skip": skip, "limit": limit, "items": items}
@router.get("/{hfUserId}/profile")
async def profile(hfUserId: str):
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


    db = get_db()

    # 1) 找到 user（Mongo users）
    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(404, "User not found in Mongo users")

    user_oid = user["_id"]

    # 2) 讀 conversations（先抓最近 N 筆，避免太大）
    N = 200
    convs = await db["conversations"].find(
        {"userId": user_oid},
        {"messages": 1, "assistantId": 1, "createdAt": 1, "updatedAt": 1, "model": 1},
    ).sort("updatedAt", -1).limit(N).to_list(length=N)

    conversation_count = await db["conversations"].count_documents({"userId": user_oid})

    # 3) 統計 metrics
    msg_count = 0
    total_turns = 0
    total_duration_min = 0.0

    text_all = []
    usage_counter = Counter()

    # timeseries：按天平均
    by_day = defaultdict(lambda: {
        "englishRatio": [],
        "lexicalRichness": [],
        "turns": [],
        "durationMin": []
    })

    for c in convs:
        msgs = c.get("messages") or []
        msg_count += len(msgs)

        # turns：以 user message 數近似（或你要 user+assistant pairs 都行）
        turns = sum(1 for m in msgs if (m.get("from") == "user"))
        total_turns += turns

        # duration
        created = c.get("createdAt")
        updated = c.get("updatedAt") or created
        dur_min = 0.0
        if created and updated:
            try:
                if created.tzinfo is None: created = created.replace(tzinfo=timezone.utc)
                if updated.tzinfo is None: updated = updated.replace(tzinfo=timezone.utc)
                dur_min = max(0.0, (updated - created).total_seconds() / 60)
            except:
                dur_min = 0.0
        total_duration_min += dur_min

        # assistant usage
        aid = c.get("assistantId")
        if aid:
            # 有些是 ObjectId，有些是字串
            usage_counter[str(aid)] += 1

        # 收集 user content 做語言分析（只分析 user 的英文更符合學生）
        user_text = " ".join(
            (m.get("content") or "") for m in msgs if m.get("from") == "user"
        )
        if user_text.strip():
            text_all.append(user_text)

        # 日聚合
        dkey = day_key(updated or created)
        # 這筆對話的 english/lexical
        er, lx, _ = analyze_text_metrics(user_text)
        by_day[dkey]["englishRatio"].append(er)
        by_day[dkey]["lexicalRichness"].append(lx)
        by_day[dkey]["turns"].append(turns)
        by_day[dkey]["durationMin"].append(dur_min)

    merged_text = "\n".join(text_all)
    english_ratio, lexical_richness, _ = analyze_text_metrics(merged_text)

    avg_turns = (total_turns / len(convs)) if convs else 0.0
    avg_duration = (total_duration_min / len(convs)) if convs else 0.0

    # 4) assistant name lookup
    top_usage = usage_counter.most_common(8)
    name_map = await _assistant_name_map(db, [aid for aid, _ in top_usage])

    assistant_usage = [
        {"assistantId": aid, "name": name_map.get(aid, aid), "count": cnt}
        for aid, cnt in top_usage
    ]

    # 5) CEFR bands（來自 users.agentCefr）
    agent_cefr = user.get("agentCefr") or []
    # agent_cefr 內 assistantId 可能是 ObjectId
    cefr_items = []
    for it in agent_cefr:
        aid = it.get("assistantId")
        aid_str = str(aid) if aid else ""
        cefr_items.append({
            "assistantId": aid_str,
            "assistantName": name_map.get(aid_str),  # 先用 top usage 的 map（不一定全）
            "levelKey": _norm_level(it.get("levelKey")),
            "nextLevelKey": _norm_level(it.get("nextLevelKey")),
            "confidence": it.get("advice", {}).get("confidence", it.get("confidence")),
            "updatedAt": it.get("advice", {}).get("updatedAt", it.get("updatedAt")),
            "advice": it.get("advice") or {},
        })

    # 把 cefr items 的 assistantName 補齊（查 assistants）
    missing_ids = [x["assistantId"] for x in cefr_items if x["assistantId"] and not x["assistantName"]]
    if missing_ids:
        extra_map = await _assistant_name_map(db, missing_ids)
        for x in cefr_items:
            if x["assistantId"] in extra_map:
                x["assistantName"] = extra_map[x["assistantId"]]
    for x in cefr_items:
        if not x["assistantName"]:
            x["assistantName"] = x["assistantId"] or "Unknown"

    # band 分類：用 levelKey 的首字母+數字做大類（A1/A2/B1/B2…）
    band_groups = defaultdict(list)
    for x in cefr_items:
        lk = x["levelKey"]
        band = lk if lk else "Unknown"
        band_groups[band].append(x)

    def band_title(band: str):
        mapping = {
            "A1": "A1（入門級）",
            "A2": "A2（基礎級）",
            "B1": "B1（中級）",
            "B2": "B2（進階級）",
            "C1": "C1（高級）",
            "C2": "C2（精通級）",
        }
        return mapping.get(band, band)

    cefr_bands = [
        {"band": b, "title": band_title(b), "items": band_groups[b]}
        for b in sorted(band_groups.keys())
    ]

    # 6) timeseries（只取最近 14 天、每個指標用平均）
    labels = sorted([k for k in by_day.keys() if k != "unknown"])[-14:]
    def avg(xs): return (sum(xs) / len(xs)) if xs else 0.0

    timeseries = {
        "labels": labels,
        "englishRatio": [avg(by_day[k]["englishRatio"]) for k in labels],
        "lexicalRichness": [avg(by_day[k]["lexicalRichness"]) for k in labels],
        "avgTurns": [avg(by_day[k]["turns"]) for k in labels],
        "avgDurationMin": [avg(by_day[k]["durationMin"]) for k in labels],
    }

    return {
        "stats": {
            "conversationCount": conversation_count,
            "messageCount": msg_count,
            "englishRatio": round(english_ratio, 4),
            "lexicalRichness": round(lexical_richness, 4),
            "avgTurns": round(avg_turns, 2),
            "avgDurationMin": round(avg_duration, 2),
        },
        "timeseries": timeseries,
        "assistantUsage": assistant_usage,
        "cefrBands": cefr_bands,
    }
# ----------------------------
# Utils: assistantId -> name map
# ----------------------------
async def build_assistant_name_map(db, assistant_ids: list[Any]) -> dict[str, str]:
    obj_ids: list[ObjectId] = []
    for a in assistant_ids:
        try:
            if isinstance(a, ObjectId):
                obj_ids.append(a)
            else:
                obj_ids.append(ObjectId(str(a)))
        except Exception:
            pass

    if not obj_ids:
        return {}

    m: dict[str, str] = {}
    cursor = db["assistants"].find({"_id": {"$in": obj_ids}}, {"name": 1})
    async for doc in cursor:
        m[str(doc["_id"])] = doc.get("name") or "Unnamed"
    return m

# ----------------------------
# Metrics: 英文佔比 / 詞彙豐富度
# ----------------------------
_RE_EN = re.compile(r"[A-Za-z]")
_RE_HAN = re.compile(r"[\u4e00-\u9fff]")
_RE_WORD = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")

def analyze_text_metrics(text: str) -> tuple[float, float]:
    text = text or ""

    en_chars = len(_RE_EN.findall(text))
    han_chars = len(_RE_HAN.findall(text))
    total_letters = en_chars + han_chars
    english_ratio = (en_chars / total_letters) if total_letters else 0.0

    words = [w.lower() for w in _RE_WORD.findall(text)]
    lexical = (len(set(words)) / len(words)) if words else 0.0

    return english_ratio, lexical

def day_key(dt: datetime | None) -> str:
    if not dt:
        return "unknown"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")

# ----------------------------
# Overview API
# ----------------------------
@router.get("/{hfUserId}/overview")
async def student_overview(hfUserId: str):
    db = get_db()

    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in Mongo users")

    user_oid = user["_id"]

    # 取 conversations（你資料庫是 conversations.messages[]）
    convs = await db["conversations"].find({"userId": user_oid}).to_list(length=5000)

    # ---- assistant usage (by conversations count)
    assistant_counter = Counter()
    assistant_ids_for_lookup: list[Any] = []

    for c in convs:
        a = c.get("assistantId")
        if a is not None:
            assistant_counter[str(a)] += 1
            assistant_ids_for_lookup.append(a)

    assistant_name_map = await build_assistant_name_map(db, assistant_ids_for_lookup)

    assistant_usage = []
    for aid, cnt in assistant_counter.most_common(8):
        assistant_usage.append({
            "assistantId": aid,
            "name": assistant_name_map.get(aid, aid),  # fallback: id
            "count": cnt,
        })

    # ---- compute overall stats
    all_text_parts: list[str] = []
    total_messages = 0
    turns_list = []
    duration_list = []

    for c in convs:
        msgs = c.get("messages") or []
        total_messages += len(msgs)

        # turns: count user messages
        turns = sum(1 for m in msgs if (m.get("from") == "user" and m.get("content")))
        turns_list.append(turns)

        # duration: updatedAt - createdAt (minutes)
        created = c.get("createdAt")
        updated = c.get("updatedAt")
        if created and updated:
            try:
                duration_list.append((updated - created).total_seconds() / 60.0)
            except Exception:
                pass

        for m in msgs:
            if m.get("from") in ("user", "assistant"):
                content = m.get("content") or ""
                if content.strip():
                    all_text_parts.append(content)

    full_text = "\n".join(all_text_parts)
    english_ratio, lexical_richness = analyze_text_metrics(full_text)

    avg_turns = round((sum(turns_list) / len(turns_list)), 2) if turns_list else 0
    avg_duration = round((sum(duration_list) / len(duration_list)), 2) if duration_list else 0

    stats = {
        "conversationCount": len(convs),
        "messageCount": total_messages,
        "englishRatio": round(english_ratio, 4),
        "lexicalRichness": round(lexical_richness, 4),
        "avgTurns": avg_turns,
        "avgDurationMin": avg_duration,
    }

    # ---- timeseries by day (use updatedAt if possible)
    by_day: dict[str, list[dict]] = defaultdict(list)
    for c in convs:
        k = day_key(c.get("updatedAt") or c.get("createdAt"))
        by_day[k].append(c)

    labels = sorted([k for k in by_day.keys() if k != "unknown"])
    ts_english, ts_lex, ts_turns, ts_dur = [], [], [], []

    for k in labels:
        subset = by_day[k]
        subset_text_parts = []
        subset_turns = []
        subset_durs = []

        for c in subset:
            msgs = c.get("messages") or []
            subset_turns.append(sum(1 for m in msgs if m.get("from") == "user" and m.get("content")))
            created = c.get("createdAt")
            updated = c.get("updatedAt")
            if created and updated:
                try:
                    subset_durs.append((updated - created).total_seconds() / 60.0)
                except Exception:
                    pass

            for m in msgs:
                if m.get("from") in ("user", "assistant"):
                    t = (m.get("content") or "").strip()
                    if t:
                        subset_text_parts.append(t)

        er, lx = analyze_text_metrics("\n".join(subset_text_parts))
        ts_english.append(round(er, 4))
        ts_lex.append(round(lx, 4))
        ts_turns.append(round(sum(subset_turns) / len(subset_turns), 2) if subset_turns else 0)
        ts_dur.append(round(sum(subset_durs) / len(subset_durs), 2) if subset_durs else 0)

    timeseries = {
        "labels": labels,
        "englishRatio": ts_english,
        "lexicalRichness": ts_lex,
        "avgTurns": ts_turns,
        "avgDurationMin": ts_dur,
    }

    # ---- CEFR groups: users.agentCefr[] 依 levelKey 分組，點 assistant 才看 advice
    agent_cefr = user.get("agentCefr") or []
    cefr_assistant_ids = [x.get("assistantId") for x in agent_cefr if x.get("assistantId")]
    cefr_name_map = await build_assistant_name_map(db, cefr_assistant_ids)

    groups: dict[str, list[dict]] = defaultdict(list)
    for x in agent_cefr:
        level = (x.get("levelKey") or "Unknown").strip()
        aid = x.get("assistantId")
        aid_str = str(aid) if aid is not None else ""
        groups[level].append({
            "assistantId": aid_str,
            "assistantName": cefr_name_map.get(aid_str, aid_str),
            "levelKey": x.get("levelKey"),
            "nextLevelKey": x.get("nextLevelKey"),
            "confidence": x.get("confidence"),
            "updatedAt": x.get("updatedAt"),
            "advice": x.get("advice") or {},
        })

    # 排序（大概照 CEFR 順序）
    order = ["PreA1", "A1", "A2", "B1", "B2", "C1", "C2", "C1C2"]
    def level_sort_key(k: str) -> int:
        return order.index(k) if k in order else 999

    cefr_groups = []
    for level in sorted(groups.keys(), key=level_sort_key):
        cefr_groups.append({
            "levelKey": level,
            "title": level,
            "assistants": groups[level],
        })

    return {
        "hfUserId": normalize_hf_user_id(hfUserId),
        "stats": stats,
        "timeseries": timeseries,
        "assistantUsage": assistant_usage,
        "cefrGroups": cefr_groups,
    }

