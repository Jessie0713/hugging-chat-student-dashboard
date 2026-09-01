# backend/student_api.py
from __future__ import annotations

import os
import re
from datetime import datetime, timezone, timedelta
from collections import Counter, defaultdict
from typing import Any
import json
from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from pydantic import BaseModel, Field

from mongo_db import get_db_by_source, normalize_source
from db import fetch_one  # 你已經有 Moodle 的連線工具
from azure_openai import azure_chat
from course_score import (
    DASHBOARD_ENTER_EVENT,
    DASHBOARD_PICK_EVENT,
    DASHBOARD_USAGE_WINDOW_HOURS,
    DASHBOARD_VIEW_EVENTS,
    DEFAULT_BADGE_DEFINITIONS,
    compute_course_score,
    compute_earned_badge_ids,
    is_level_advanced,
)
router = APIRouter(prefix="/api/{source}/student", tags=["student"])


class DashboardEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=120)
    sessionId: str | None = Field(default=None, max_length=80)
    page: str | None = Field(default=None, max_length=80)
    step: int | None = None
    payload: dict[str, Any] | None = None

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
async def header(source: str, hfUserId: str):
    db = get_db_by_source(source)
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


@router.post("/{hfUserId}/events")
async def log_dashboard_event(source: str, hfUserId: str, body: DashboardEventIn):
    """
    Dashboard 使用事件（練習建議漏斗等）。
    寫入失敗不應影響前端流程；此端點盡量回 ok。
    """
    try:
        db = get_db_by_source(source)
        user = await find_user_by_hf_user_id(db, hfUserId)
        if not user:
            return {"ok": False, "error": "user_not_found"}

        event = (body.event or "").strip()
        if not event:
            return {"ok": False, "error": "empty_event"}

        payload = body.payload if isinstance(body.payload, dict) else {}
        # 避免單筆過大
        try:
            raw = json.dumps(payload, ensure_ascii=False, default=str)
            if len(raw) > 20000:
                payload = {"_truncated": True, "preview": raw[:2000]}
        except Exception:
            payload = {}

        doc = {
            "ts": datetime.now(timezone.utc),
            "event": event,
            "source": normalize_source(source),
            "hfUserId": normalize_hf_user_id(hfUserId),
            "mongoUserId": str(user["_id"]),
            "sessionId": (body.sessionId or "").strip() or None,
            "page": (body.page or "").strip() or None,
            "step": body.step,
            "payload": payload,
        }
        await db["dashboard_events"].insert_one(doc)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# backend/student_api.py (Partial Update)

# ... (保留原本的 imports)
# 確保有 import build_assistant_name_map
# from student_api import build_assistant_name_map (如果在同檔案最後面有定義，則直接呼叫)


# 「總覽與評語」AI 分析 prompt（培力英檢／CEFR 導向）
# 佔位符 {{STUDENT_ANALYSIS_DATA}} 由 ai_advice 填入 overview 摘要 JSON
AI_ADVICE_PROMPT_TEMPLATE = """
你是一位熟悉 CEFR 與培力英檢（BESTEP）口說評量的英語學習分析教練。

你的任務是分析學生在 AI 英語聊天室中的英文對話表現，找出學生目前最接近的能力表現、影響培力英檢表現的主要問題，並提供能在短期內實際執行的改善建議與三天練習計畫。

你的最終目標是協助學生逐步具備培力英檢所需要的口說能力，包括：

1. 正確理解並完成題目要求。
2. 能直接回答問題。
3. 能補充原因、細節與例子。
4. 能清楚表達立場。
5. 能比較不同資訊或觀點。
6. 能組織具有邏輯與連貫性的口說內容。
7. 能使用符合目前 CEFR 程度的語法與詞彙。
8. 能逐步提升至下一個可達成的 CEFR 等級。

你提供的是「培力英檢通過導向的學習分析」，但不得保證學生一定能通過考試。

━━━━━━━━━━━━━━━━━━━━
一、分析資料範圍
━━━━━━━━━━━━━━━━━━━━

輸入資料可能包含：

- current_cefr：目前 CEFR 等級
- target_cefr：目標 CEFR 等級
- display_level：入門、基礎、進階或高階
- cefr_history：歷次 CEFR 判定結果
- student_messages：學生英文對話
- task_prompts：學生當時回答的問題或任務
- conversation_topics：對話主題
- language_metrics：語言特徵統計
- common_errors：常見錯誤
- task_completion_data：任務完成情況
- speech_metrics：口說速度、停頓或發音等語音資料
- stats / top_assistants / cefr_groups / recent_practice / advanced_fit_progress / fit_summary：儀表板彙總資料

分析時必須遵守以下規則：

1. 只分析學生本人產出的英文內容。
2. 不得把 AI 回應、系統提示、題目文字、歌詞、翻譯、複製內容或引用內容視為學生能力。
3. 每一項觀察與建議都必須能從學生資料中找到依據。
4. 最近的對話表現應占較高比重，但也要比較歷史紀錄，判斷學生是否進步、持平或退步。
5. 不得僅根據回答長度判斷學生程度。
6. 不得因為學生偶爾使用一個艱深單字或複雜句型，就直接提高能力判定。
7. 如果資料不足，必須明確說明「目前對話資料不足」，不得捏造學生的優點、問題或進步。
8. 如果只有文字資料，不得判斷發音、語調或真正的口說流利度。
9. 只有輸入包含 speech_metrics 時，才可以針對說話速度、停頓、發音或流利度提供觀察。
10. 不得使用羞辱、責備或過度負面的語氣。
11. 必須至少指出一項學生已經做到的能力，再提出需要改善的地方。
12. 建議與練習難度應以學生目前程度為主，最多加入下一個 CEFR 等級的挑戰，不得一次跨越兩級以上。

━━━━━━━━━━━━━━━━━━━━
二、培力英檢評量重點
━━━━━━━━━━━━━━━━━━━━

請從以下面向分析學生表現：

A. 切題度與任務完成

- 是否直接回答題目？
- 是否完成題目要求？
- 是否遺漏重要問題？
- 是否能執行描述、解釋、比較、建議、說服或表達立場等溝通功能？

B. 內容完整度

- 是否只給出簡短答案？
- 是否補充原因、細節、例子或結果？
- 是否能將一個想法繼續延伸？
- 是否有足夠內容支撐自己的立場？

C. 語法範圍與正確性

- 是否能使用符合程度的完整句子？
- 錯誤是否影響理解？
- 是否能使用時態、連接詞、比較句、條件句、關係子句或其他適當結構？
- 不得只計算錯誤數量，必須考慮錯誤是否影響溝通。

D. 詞彙範圍與精確度

- 詞彙是否足以完成題目？
- 是否重複使用相同的簡單詞彙？
- 用字是否準確且符合語境？
- 是否能使用與主題相關的詞彙？

E. 語篇組織與連貫性

- 句子之間是否具有邏輯關係？
- 是否能使用 because、so、but、when、if、however、for example、therefore、as a result 等連接方式？
- 是否能依照「立場→理由→例子→結論」或其他清楚結構組織內容？
- 是否出現內容零散、重複、跳躍或缺乏結論的問題？

F. 流利度與發音

- 只有提供 speech_metrics 或語音分析結果時才可評估。
- 若無語音資料，不得推測學生的發音、語調、停頓或流利度。
- 若資料不足，可在整體觀察中說明目前只能分析文字表現。

━━━━━━━━━━━━━━━━━━━━
三、培力英檢三種任務能力
━━━━━━━━━━━━━━━━━━━━

Part 1：回答問題

學生應能：

- 直接回答問題。
- 表達個人經驗或看法。
- 補充至少一個原因或相關細節。
- 面對建議、邀請、請求或說服情境時，做出適當回應。

建議回答結構：

「直接答案＋原因＋細節或例子」

例如：

I prefer studying alone because I can focus better. For example, I usually review my notes in a quiet room before an exam.

Part 2：表達意見

學生應能：

- 清楚表達立場。
- 回答題目的所有重點。
- 提供相關理由。
- 使用例子支持觀點。
- 適當比較不同選項或觀點。
- 使用連接詞組織答案。

建議回答結構：

「立場＋理由一＋理由二或例子＋簡短結論」

例如：

I think face-to-face feedback is more helpful. First, students can ask questions immediately. For example, if I do not understand a teacher's comment, I can ask for a clearer explanation.

Part 3：摘要報告

學生應能：

- 找出文章、圖表或資料中的重點。
- 說明兩份資訊之間的主要差異。
- 正確引用重要數據或內容。
- 清楚表達同意或不同意。
- 使用個人經驗或例子支持立場。
- 依照清楚順序組織完整回答。

建議回答結構：

「主題介紹＋資料差異＋重要證據＋個人立場＋理由或例子＋結論」

例如：

The passage suggests that multitasking helps students make fewer mistakes. However, the chart shows that students make more errors when they multitask. I disagree with the passage because multitasking usually makes it harder for me to concentrate.

━━━━━━━━━━━━━━━━━━━━
四、CEFR 表現參考
━━━━━━━━━━━━━━━━━━━━

PreA1：

- 只能使用零散單字、固定短語或不完整句子。
- 回答明顯不足、無法切題或難以理解。

A1：

- 能用簡短句子表達熟悉的個人資訊。
- 詞彙與句型非常有限。
- 能表達簡單喜好或需求，但內容通常缺乏延伸。

A2：

- 能描述熟悉經驗、偏好或計畫。
- 能提供簡單原因。
- 能使用 because、so、but、when 等基本連接詞。
- 錯誤可能存在，但主要意思通常可以理解。

B1：

- 能完成主要題目要求。
- 能清楚表達意見。
- 能提供理由、細節或相關例子。
- 能使用簡單句與部分複雜句。
- 能使用連接詞組織較完整的回答。
- 錯誤通常不會妨礙理解。

B2：

- 能完整回答題目要求。
- 能比較、解釋、評估或支持立場。
- 能處理較抽象的主題。
- 能使用多樣句型與較精確的詞彙。
- 內容具有清楚組織與邏輯連貫性。

C1C2：

- 本系統將此級視為 C1 或以上。
- 能完整、精確且有條理地討論複雜議題。
- 能整合不同資訊、提出評估、限制與反方觀點。
- 能靈活使用複雜句型、精確詞彙與自然的語篇銜接。

━━━━━━━━━━━━━━━━━━━━
五、學習建議產生規則
━━━━━━━━━━━━━━━━━━━━

suggestions 必須剛好提供五項建議。

五項建議應依學生實際問題排列優先順序，優先順序如下：

1. 題目是否完整回答。
2. 內容是否有原因、細節或例子。
3. 語篇是否有清楚結構。
4. 語法錯誤是否影響理解。
5. 詞彙是否準確且足以完成任務。

每項建議都必須：

- 是學生下一次回答時可以立即執行的行動。
- 說明學生要做什麼。
- 說明學生可以怎麼做。
- 必要時提供一個符合學生程度的英文句型或例子。
- 與培力英檢 Part 1、Part 2 或 Part 3 的能力相關。
- 符合學生目前 CEFR 或下一個可達成等級。
- 不得重複相同內容。
- 不得只寫「多練習」、「增加單字量」、「改善文法」或「說得更流利」等模糊建議。
- 不得為了模仿低程度學生而提供錯誤英文。

好的建議範例：

「回答培力英檢 Part 1 題目時，不要只說 Yes 或 No，請再補充一個 because 原因及一個具體細節，例如：Yes, I do, because studying with friends helps me understand difficult ideas.」

不好的建議範例：

「多練習英文口說。」

━━━━━━━━━━━━━━━━━━━━
六、三天練習計畫
━━━━━━━━━━━━━━━━━━━━

plan 必須剛好包含 Day 1、Day 2、Day 3 三項。

每一天的內容必須放在單一字串內，並包含：

1. 培力英檢題型。
2. 當天練習目標。
3. 具體練習步驟。
4. 建議練習時間。
5. 可衡量的完成標準。

每次練習應控制在約10至15分鐘。

三天的活動不得完全相同，而且必須直接回應 intro 中指出的主要問題。

請依目前程度安排練習：

PreA1或A1：

- 優先安排兩次 Part 1。
- 第三次安排簡化版 Part 2。
- 目標是從單字或短句進步到完整句子及簡單原因。

A2：

- 安排一次 Part 1。
- 安排一次 Part 2。
- 第三次進行限時重答或錄音比較。
- 目標是建立「答案＋原因＋細節」結構。

B1：

- 安排一次 Part 1。
- 安排一次 Part 2。
- 安排一次簡化 Part 3。
- 目標是完整回答、提供例子並建立清楚語篇結構。

B2或C1C2：

- 安排一次 Part 2。
- 安排兩次 Part 3。
- 目標是比較、評估、提出立場、使用證據並組織完整論述。

若學生有特別明顯的弱點，可調整題型比例，但必須在練習內容中說明練習目的。

━━━━━━━━━━━━━━━━━━━━
七、輸出格式
━━━━━━━━━━━━━━━━━━━━

你只能輸出合法 JSON。

JSON 格式必須完全符合以下結構：

{
  "intro": "1到3句整體觀察，使用繁體中文",
  "suggestions": [
    "建議1",
    "建議2",
    "建議3",
    "建議4",
    "建議5"
  ],
  "plan": [
    "Day 1：練習內容",
    "Day 2：練習內容",
    "Day 3：練習內容"
  ]
}

intro 規則：

- 必須使用臺灣繁體中文。
- 必須為1到3個完整句子。
- 必須包含一項學生已展現的能力。
- 必須指出一項最需要優先改善的能力。
- 必須說明該能力與培力英檢表現的關係。
- 不得列出過多細節。
- 不得保證學生能通過考試。

suggestions 規則：

- 必須剛好有5個字串。
- 不可少於或超過5項。
- 必須按照重要性排列。
- 每項建議必須具體且可執行。
- 五項內容不得重複。

plan 規則：

- 必須剛好有3個字串。
- 不可少於或超過3項。
- 第一項必須以「Day 1：」開始。
- 第二項必須以「Day 2：」開始。
- 第三項必須以「Day 3：」開始。
- 每一天必須包含練習題型、步驟、時間與完成標準。

嚴格格式限制：

- 不得加入 observation、actionable_advice、practice_plan 或其他欄位。
- 不得增加巢狀物件。
- 不得輸出 Markdown。
- 不得使用程式碼區塊包住 JSON。
- 不得在 JSON 前後加入任何解釋。
- 所有 key 和字串值必須使用英文半形雙引號。
- 不得使用單引號。
- 不得包含 trailing comma。
- 不得輸出 null、undefined、NaN 或註解。
- 字串內若需要使用引號，請改用中文書名號或其他不破壞 JSON 的符號。
- 輸出前必須自行檢查 JSON 是否可被 JSON.parse() 正確解析。

━━━━━━━━━━━━━━━━━━━━
八、學生分析資料
━━━━━━━━━━━━━━━━━━━━

請根據以下資料進行分析：

{{STUDENT_ANALYSIS_DATA}}

現在請只輸出符合指定結構的合法 JSON。
""".strip()


def _normalize_ai_advice_plan_item(text: str, day_index: int) -> str:
    """確保 plan 字串以 Day N：開頭（符合前端 Chip 與 prompt 規範）。"""
    t = (text or "").strip()
    prefix = f"Day {day_index}："
    alt = f"Day {day_index}:"
    if t.startswith(prefix) or t.startswith(alt):
        if t.startswith(alt) and not t.startswith(prefix):
            return prefix + t[len(alt) :].lstrip()
        return t
    # 常見變體：Day 1 練習… / 第1天…
    stripped = re.sub(
        rf"^(Day\s*{day_index}|第\s*{day_index}\s*天)\s*[:：]?\s*",
        "",
        t,
        flags=re.IGNORECASE,
    )
    return prefix + (stripped or t)


@router.post("/{hfUserId}/ai-advice")
async def ai_advice(source: str, hfUserId: str):
    """
    點擊後才觸發 AI 分析（對話分析頁「總覽與評語」）
    回傳固定 JSON：intro / suggestions[5] / plan[3]
    """
    try:
        ov = await student_overview(source, hfUserId)
    except Exception as e:
        return {
            "ok": False,
            "intro": "",
            "suggestions": [],
            "plan": [],
            "rawText": f"[student_overview error] {str(e)}",
        }

    try:
        # 儀表板現有欄位；缺語音／逐字稿時模型應依規則聲明資料不足
        prompt_data = {
            "stats": ov.get("stats"),
            "top_assistants": ov.get("assistantUsage", [])[:5],
            "cefr_groups": ov.get("cefrGroups", []),
            "recent_practice": ov.get("recentPractice", [])[:10],
            "advanced_fit_progress": ov.get("advancedFitProgress"),
            "fit_summary": ov.get("fitSummary"),
            "timeseries": ov.get("timeseries"),
            "note": (
                "目前輸入以儀表板彙總為主；若無 student_messages 或 speech_metrics，"
                "請依規則說明資料限制，不得捏造。"
            ),
        }
        student_json = json.dumps(
            prompt_data, ensure_ascii=False, indent=2, default=str
        )
        prompt = AI_ADVICE_PROMPT_TEMPLATE.replace(
            "{{STUDENT_ANALYSIS_DATA}}", student_json
        )
    except Exception as e:
        return {
            "ok": False,
            "intro": "",
            "suggestions": [],
            "plan": [],
            "rawText": f"[prompt build error] {str(e)}",
        }

    try:
        text = await azure_chat(prompt)
        cleaned = (text or "").strip()

        # 清掉模型偶爾偷加的 code fence
        cleaned = re.sub(r"^```json\s*", "", cleaned)
        cleaned = re.sub(r"^```\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

        parsed = json.loads(cleaned)

        intro = parsed.get("intro", "")
        suggestions = parsed.get("suggestions", [])
        plan = parsed.get("plan", [])

        if not isinstance(intro, str):
            intro = ""

        if not isinstance(suggestions, list):
            suggestions = []

        if not isinstance(plan, list):
            plan = []

        suggestions = [str(x).strip() for x in suggestions if str(x).strip()]
        plan = [str(x).strip() for x in plan if str(x).strip()]

        suggestions = suggestions[:5]
        plan = plan[:3]

        while len(suggestions) < 5:
            suggestions.append(
                "回答培力英檢 Part 1 時，先直接回答問題，再補一個 because 原因與一個具體細節。"
            )

        default_plans = [
            "Day 1：練習 Part 1（10–15 分鐘）。目標：完整回答＋原因。步驟：選一題熟悉主題→用「答案＋because＋細節」說兩輪→對照錄音或文字檢查是否切題。完成標準：至少兩次回答都含原因與細節。",
            "Day 2：練習 Part 2（10–15 分鐘）。目標：清楚立場與結構。步驟：先說立場→兩個理由或一個例子→一句結論。完成標準：一次完整回答含立場、理由、結語。",
            "Day 3：限時重答或簡化 Part 3（10–15 分鐘）。目標：複習前兩天弱點。步驟：重答 Day 1 或 Day 2 題→對照是否補上原因／結構。完成標準：比第一天少一項遺漏。",
        ]
        while len(plan) < 3:
            plan.append(default_plans[len(plan)])

        plan = [_normalize_ai_advice_plan_item(p, i + 1) for i, p in enumerate(plan)]

        return {
            "ok": True,
            "intro": intro.strip(),
            "suggestions": suggestions,
            "plan": plan,
            "rawText": cleaned,
        }

    except Exception as e:
        return {
            "ok": False,
            "intro": "",
            "suggestions": [],
            "plan": [],
            "rawText": f"[ai_advice parse error] {str(e)}",
        }


# CEFR levelKey → 外顯練習等級（與 Chat UI / Dashboard 一致）
CEFR_TO_PRACTICE_TIER: dict[str, str] = {
    "PreA1": "入門",
    "A1": "基礎",
    "A2": "基礎",
    "B1": "基礎",
    "B2": "進階",
    "C1": "高階",
    "C2": "高階",
    "C1C2": "高階",
}

# 舊 users.badge.earnedIds → 新 Mongo badges.id（與 Chat UI LEGACY_BADGE_ID_MAP 對齊）
LEGACY_BADGE_ID_MAP: dict[str, str | None] = {
    "first_message": "egg_hatch",
    "effective_round": "first_nest",
    "topics_5": "trail_five",
    "topics_6": None,
    "topics_7": None,
    "advanced_cert": None,
}

# 純舊制／習慣型 id（僅標記 legacy，不進現行 earned）
LEGACY_HABIT_BADGE_IDS = {
    "streak_3",
    "streak_7",
    "levelup_3",
    "assist_3",
    "msg_100",
    "voice_master",
}


def remap_legacy_badge_ids(ids: list) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in ids or []:
        if not isinstance(raw, str):
            continue
        if raw in LEGACY_BADGE_ID_MAP:
            mapped = LEGACY_BADGE_ID_MAP[raw]
            if mapped and mapped not in seen:
                seen.add(mapped)
                out.append(mapped)
            continue
        if raw in LEGACY_HABIT_BADGE_IDS:
            continue
        if raw not in seen:
            seen.add(raw)
            out.append(raw)
    return out


async def load_badge_definitions(db) -> list[dict]:
    """讀 Mongo `badges` collection（enabled≠false，依 sortOrder）。"""
    try:
        cursor = db["badges"].find({"enabled": {"$ne": False}}).sort(
            [("sortOrder", 1)]
        )
        docs = await cursor.to_list(length=100)
    except Exception:
        return []

    defs: list[dict] = []
    for doc in docs:
        bid = doc.get("id")
        if not isinstance(bid, str) or not bid:
            continue
        threshold = int(doc.get("threshold") or 0)
        rule_type = doc.get("ruleType") or "completed_topics"
        defs.append(
            {
                "id": bid,
                "name": doc.get("name") or bid,
                "meaning": doc.get("meaning") or "",
                "unlock": doc.get("unlockText") or doc.get("unlock") or "",
                "iconUrl": doc.get("iconUrl") or "",
                "ruleType": rule_type,
                "threshold": threshold,
                "sortOrder": int(doc.get("sortOrder") or 0),
                "enabled": doc.get("enabled") is not False,
                "phase": doc.get("phase"),
                "meta": doc.get("meta") if isinstance(doc.get("meta"), dict) else {},
                "gradeNote": doc.get("gradeNote"),
            }
        )
    defs.sort(key=lambda d: d.get("sortOrder") or 0)
    return defs


def resolve_badge_definitions(mongo_defs: list[dict]) -> list[dict]:
    """Mongo 無新制 id 時改用內建定義。"""
    if not mongo_defs:
        return list(DEFAULT_BADGE_DEFINITIONS)
    ids = {d.get("id") for d in mongo_defs if isinstance(d.get("id"), str)}
    if "milestone_topics_2" in ids or "milestone_topics_8" in ids:
        return mongo_defs
    return list(DEFAULT_BADGE_DEFINITIONS)


def _practice_tier_from_level_key(level_key: str | None) -> str | None:
    if not level_key:
        return None
    return CEFR_TO_PRACTICE_TIER.get(level_key.strip())


def _normalize_achievement_badge_stats(badge_stats: dict) -> dict:
    """對齊 Chat UI users.badge.stats；舊欄位 fallback 避免舊資料全 0。"""
    per_assistant = badge_stats.get("perAssistant")
    if not isinstance(per_assistant, dict):
        per_assistant = {}

    if not per_assistant:
        qualified = badge_stats.get("qualifiedByAssistant") or {}
        effective_ids = {
            str(x) for x in (badge_stats.get("effectiveAssistantIds") or [])
        }
        for aid, count in qualified.items():
            aid_str = str(aid)
            ec = int(count or 0)
            per_assistant[aid_str] = {
                "effectiveCount": min(max(ec, 0), 8),
                "effectiveRoundComplete": aid_str in effective_ids or ec >= 8,
            }

    completed = badge_stats.get("completedTopicCount")
    if completed is None:
        completed = sum(
            1
            for v in per_assistant.values()
            if isinstance(v, dict) and v.get("effectiveRoundComplete")
        )

    max_eff = badge_stats.get("maxEffectiveCount")
    if max_eff is None:
        counts = [
            int(v.get("effectiveCount") or 0)
            for v in per_assistant.values()
            if isinstance(v, dict)
        ]
        max_eff = max(counts) if counts else 0

    advanced = badge_stats.get("advancedTopicCount")
    adv_ids_raw = badge_stats.get("effectiveAdvancedAssistantIds") or []
    adv_ids = [str(x) for x in adv_ids_raw if x is not None and str(x).strip()]
    if advanced is None:
        advanced = len(adv_ids)

    normalized_per: dict[str, dict] = {}
    for aid, info in per_assistant.items():
        if not isinstance(info, dict):
            continue
        ec = min(max(int(info.get("effectiveCount") or 0), 0), 8)
        normalized_per[str(aid)] = {
            "effectiveCount": ec,
            "effectiveRoundComplete": bool(
                info.get("effectiveRoundComplete") or ec >= 8
            ),
        }

    return {
        "totalMessages": int(badge_stats.get("totalMessages") or 0),
        "perAssistant": normalized_per,
        "completedTopicCount": int(completed or 0),
        "advancedTopicCount": int(advanced or 0),
        "effectiveAdvancedAssistantIds": adv_ids,
        "maxEffectiveCount": int(max_eff or 0),
    }


async def count_dashboard_views(db, hf_user_id: str) -> int:
    """儀表板查看次數（含練習建議頁 practice_next_view）。"""
    try:
        return await db["dashboard_events"].count_documents(
            {
                "hfUserId": normalize_hf_user_id(hf_user_id),
                "event": {"$in": list(DASHBOARD_VIEW_EVENTS)},
            }
        )
    except Exception:
        return 0


async def count_dashboard_usage(db, hf_user_id: str) -> int:
    """依練習建議完成練習：practice_room_pick 與 practice_room_enter 在窗口內配對。"""
    hf = normalize_hf_user_id(hf_user_id)
    window = timedelta(hours=DASHBOARD_USAGE_WINDOW_HOURS)
    try:
        cursor = db["dashboard_events"].find(
            {
                "hfUserId": hf,
                "event": {"$in": [DASHBOARD_PICK_EVENT, DASHBOARD_ENTER_EVENT]},
            },
            {"event": 1, "ts": 1, "payload": 1},
        ).sort([("ts", 1)])
        docs = await cursor.to_list(length=10000)
    except Exception:
        return 0

    picks: list[dict] = []
    enters: list[dict] = []
    for doc in docs:
        ev = doc.get("event")
        payload = doc.get("payload") if isinstance(doc.get("payload"), dict) else {}
        ts = doc.get("ts")
        if ev == DASHBOARD_PICK_EVENT:
            picks.append({
                "ts": ts,
                "pickId": (payload.get("pickId") or "").strip() or None,
                "conversationId": (payload.get("conversationId") or "").strip() or None,
            })
        elif ev == DASHBOARD_ENTER_EVENT:
            enters.append({
                "ts": ts,
                "pickId": (payload.get("pickId") or "").strip() or None,
                "conversationId": (payload.get("conversationId") or "").strip() or None,
            })

    used_enters: set[int] = set()
    matched = 0
    for pick in picks:
        pick_ts = pick.get("ts")
        if not isinstance(pick_ts, datetime):
            continue
        for idx, ent in enumerate(enters):
            if idx in used_enters:
                continue
            ent_ts = ent.get("ts")
            if not isinstance(ent_ts, datetime):
                continue
            delta = ent_ts - pick_ts
            if delta < timedelta(0) or delta > window:
                continue
            if pick["pickId"] and ent["pickId"] and pick["pickId"] == ent["pickId"]:
                used_enters.add(idx)
                matched += 1
                break
            if (
                pick["conversationId"]
                and ent["conversationId"]
                and pick["conversationId"] == ent["conversationId"]
            ):
                used_enters.add(idx)
                matched += 1
                break
    return matched


async def count_second_advanced_assistants(db, user_oid: ObjectId) -> int:
    """第二次評級達進階（B2+）的 assistant 數。"""
    try:
        cursor = db["cefrEvents"].find(
            {"userId": user_oid},
            {"assistantId": 1, "levelKey": 1, "createdAt": 1},
        ).sort([("createdAt", 1)])
        docs = await cursor.to_list(length=50000)
    except Exception:
        return 0

    by_assistant: dict[str, list[str | None]] = defaultdict(list)
    for doc in docs:
        aid = doc.get("assistantId")
        if aid is None:
            continue
        by_assistant[str(aid)].append(doc.get("levelKey"))

    count = 0
    for ratings in by_assistant.values():
        if len(ratings) < 2:
            continue
        if is_level_advanced(ratings[1]):
            count += 1
    return count


async def build_badge_topic_details(
    db,
    user: dict,
    badge_stats: dict,
) -> list[dict]:
    per_assistant = badge_stats.get("perAssistant") or {}
    agent_map: dict[str, dict] = {}
    for entry in user.get("agentCefr") or []:
        aid = entry.get("assistantId")
        if aid is not None:
            agent_map[str(aid)] = entry

    assistant_ids = list(per_assistant.keys())
    name_map = await build_assistant_name_map(db, assistant_ids)

    details = []
    for aid, info in per_assistant.items():
        if not isinstance(info, dict):
            continue
        agent = agent_map.get(aid, {})
        level_key = agent.get("levelKey")
        details.append({
            "assistantId": aid,
            "assistantName": name_map.get(aid, aid),
            "effectiveCount": int(info.get("effectiveCount") or 0),
            "effectiveRoundComplete": bool(info.get("effectiveRoundComplete")),
            "practiceTier": _practice_tier_from_level_key(level_key),
            "levelKey": level_key,
        })

    details.sort(
        key=lambda x: (
            not x.get("effectiveRoundComplete"),
            -(x.get("effectiveCount") or 0),
            x.get("assistantName") or "",
        ),
    )
    return details


async def build_badge_payload(
    db,
    user: dict,
    badge: dict,
    hf_user_id: str,
    source: str,
    definitions: list[dict] | None = None,
) -> dict:
    """Normalize users.badge；新制成績與 computed earnedIds。"""
    badge_stats = badge.get("stats") or {}
    earned_raw = badge.get("earnedIds") or []
    stored_earned = earned_raw if isinstance(earned_raw, list) else []
    inbox = badge.get("inbox") or []

    stats = _normalize_achievement_badge_stats(badge_stats)
    hf_user_id = normalize_hf_user_id(hf_user_id)

    dashboard_usage = await count_dashboard_usage(db, hf_user_id)
    second_advanced = await count_second_advanced_assistants(db, user["_id"])
    completed_topics = int(stats.get("completedTopicCount") or 0)

    stats = {
        **stats,
        "dashboardUsageCount": dashboard_usage,
        "dashboardViewCount": dashboard_usage,
        "secondAdvancedCount": second_advanced,
    }

    defs = definitions if definitions else DEFAULT_BADGE_DEFINITIONS
    if not defs:
        defs = DEFAULT_BADGE_DEFINITIONS

    computed_earned = compute_earned_badge_ids(
        stats,
        completed_topics,
        dashboard_usage,
        second_advanced,
        defs,
    )

    remapped_stored = remap_legacy_badge_ids(stored_earned)
    active_ids = {d["id"] for d in defs if isinstance(d.get("id"), str)}

    legacy_earned = [
        e
        for e in stored_earned
        if isinstance(e, str)
        and (
            e in LEGACY_HABIT_BADGE_IDS
            or e in LEGACY_BADGE_ID_MAP
            or (active_ids and e not in active_ids)
        )
    ]

    grade = compute_course_score(
        completed_topics,
        dashboard_usage,
        second_advanced,
    )

    return {
        "earnedIds": computed_earned,
        "storedEarnedIds": remapped_stored,
        "legacyEarnedIds": legacy_earned,
        "inbox": inbox if isinstance(inbox, list) else [],
        "stats": stats,
        "gradeEstimate": grade,
        "courseScore": grade,
    }


@router.get("/{hfUserId}/badges")
async def badges(source: str, hfUserId: str):
    db = get_db_by_source(source)
    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in Mongo users")

    definitions = resolve_badge_definitions(await load_badge_definitions(db))
    badge_payload = await build_badge_payload(
        db, user, user.get("badge") or {}, hfUserId, source, definitions
    )
    topic_details = await build_badge_topic_details(
        db, user, badge_payload["stats"]
    )
    return {
        "hfUserId": normalize_hf_user_id(hfUserId),
        "mongoUserId": str(user["_id"]),
        "badge": badge_payload,
        "badgeDefinitions": definitions,
        "badgeTopicDetails": topic_details,
    }
# backend/student_api.py


@router.get("/{hfUserId}/conversations")
async def conversations(source: str, hfUserId: str, skip: int = 0, limit: int = Query(20, ge=1, le=100)):
    db = get_db_by_source(source)
    user = await find_user_by_hf_user_id(db, hfUserId)
    if not user:
        raise HTTPException(404, "User not found")

    user_oid = user["_id"]

    docs = await (
        db["conversations"]
        .find({"userId": user_oid})
        .sort([("updatedAt", -1), ("_id", -1)])
        .skip(skip)
        .limit(limit)
        .to_list(length=limit)
    )

    assistant_ids = [doc.get("assistantId") for doc in docs if doc.get("assistantId")]
    name_map = await build_assistant_name_map(db, assistant_ids)

    items = []
    for doc in docs:
        raw_messages = doc.get("messages", []) or []
        messages = []

        for m in raw_messages:
            content = (m.get("content") or "").strip()
            if m.get("from") in ("user", "assistant") and content:
                messages.append({
                    "from": m.get("from"),
                    "content": content,
                    "isVoice": bool(m.get("isVoice", False)),
                })

        aid = doc.get("assistantId")
        aid_str = str(aid) if aid else None

        cefr = doc.get("cefr") or {}

        items.append({
            "_id": str(doc["_id"]),
            "assistantId": aid_str,
            "assistantName": name_map.get(aid_str, "Unknown Assistant") if aid_str else "Unknown Assistant",
            "updatedAt": doc.get("updatedAt"),
            "messages": messages,
            "cefr": {
                "levelKey": cefr.get("levelKey"),
                "nextLevelKey": cefr.get("nextLevelKey"),
                "confidence": cefr.get("confidence"),
                "updatedAt": cefr.get("updatedAt"),
                "assessedUserTurns": cefr.get("assessedUserTurns"),
                "assistantId": str(cefr.get("assistantId")) if cefr.get("assistantId") else None,
                "advice": cefr.get("advice") or {},
            } if cefr else None,
        })

    total = await db["conversations"].count_documents({"userId": user_oid})
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": items,
    }
@router.get("/{hfUserId}/profile")
async def profile(source: str, hfUserId: str):
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
# ----------------------------
# Utils: assistantId -> name map
# ----------------------------
async def build_assistant_name_map(db, assistant_ids: list[Any]) -> dict[str, str]:
    meta = await build_assistant_meta_map(db, assistant_ids)
    return {aid: info.get("name") or "Unnamed" for aid, info in meta.items()}


async def build_conversation_model_map(db, conversation_ids: list[str]) -> dict[str, str]:
    obj_ids: list[ObjectId] = []
    for cid in conversation_ids:
        try:
            obj_ids.append(ObjectId(str(cid)))
        except Exception:
            pass
    if not obj_ids:
        return {}

    out: dict[str, str] = {}
    cursor = db["conversations"].find(
        {"_id": {"$in": obj_ids}},
        {"model": 1},
    )
    async for doc in cursor:
        model = (doc.get("model") or "").strip()
        if model:
            out[str(doc["_id"])] = model
    return out


async def build_assistant_meta_map(db, assistant_ids: list[Any]) -> dict[str, dict]:
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

    m: dict[str, dict] = {}
    cursor = db["assistants"].find(
        {"_id": {"$in": obj_ids}},
        {"name": 1, "description": 1, "modelId": 1},
    )
    async for doc in cursor:
        aid = str(doc["_id"])
        m[aid] = {
            "name": doc.get("name") or "Unnamed",
            "description": (doc.get("description") or "").strip(),
            "modelId": (doc.get("modelId") or "").strip() or None,
        }
    return m

# ----------------------------
# fixed_level: conversations.cefr → 最近 N 筆聊天練習
# ----------------------------

def _as_utc_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


def build_recent_practice(
    convs: list[dict],
    assistant_meta_map: dict[str, dict] | dict[str, str],
    limit: int = 15,
) -> tuple[list[dict], dict[str, int], set[str]]:
    """fixed_level：每個有 cefr 的 conversation 一筆，依 updatedAt 取最近 N 筆。

    第三個回傳值：程度達標主題 id 集合
    （選定進階 且 評估大階≥進階；每個 assistant 最多算一次）。
    課程進度還須再與有效對話完成集合取交集（見 overview）。
    """
    candidates: list[dict] = []

    for conv in convs:
        cefr = conv.get("cefr")
        if not cefr or not isinstance(cefr, dict):
            continue
        sort_ts = _as_utc_datetime(conv.get("updatedAt") or conv.get("createdAt"))
        if sort_ts is None:
            continue

        aid = conv.get("assistantId")
        aid_str = str(aid) if aid is not None else ""
        title = (conv.get("title") or "").strip()
        updated_at = conv.get("updatedAt") or conv.get("createdAt")
        meta = assistant_meta_map.get(aid_str)
        if isinstance(meta, dict):
            assistant_name = meta.get("name") or aid_str
            assistant_description = meta.get("description") or ""
            assistant_model = meta.get("modelId")
        else:
            assistant_name = meta or aid_str
            assistant_description = ""
            assistant_model = None

        candidates.append({
            "conversationId": str(conv["_id"]),
            "assistantId": aid_str,
            "assistantName": assistant_name,
            "assistantDescription": assistant_description,
            "conversationTitle": title or None,
            "modelId": (conv.get("model") or "").strip() or assistant_model or None,
            "targetProductTier": cefr.get("targetProductTier"),
            "targetBandLow": cefr.get("targetBandLow"),
            "targetBandHigh": cefr.get("targetBandHigh"),
            "levelKey": cefr.get("levelKey"),
            "nextLevelKey": cefr.get("nextLevelKey"),
            "confidence": cefr.get("confidence"),
            "fitStatus": cefr.get("fitStatus"),
            "assessedUserTurns": cefr.get("assessedUserTurns"),
            "lastEvalLevelKey": cefr.get("lastEvalLevelKey"),
            "advice": cefr.get("advice") or {},
            "updatedAt": updated_at,
            "_sortTs": sort_ts,
        })

    candidates.sort(key=lambda x: x["_sortTs"], reverse=True)

    # 選進階 + 評估達進階／高階；每個 assistant 最多一次
    advanced_theme_ids: set[str] = set()
    for item in candidates:
        if str(item.get("targetProductTier") or "").strip() != "進階":
            continue
        assessed = _practice_tier_from_level_key(item.get("levelKey"))
        if assessed not in ("進階", "高階"):
            continue
        aid = item.get("assistantId")
        if aid:
            advanced_theme_ids.add(str(aid))

    recent = candidates[:limit]
    for item in recent:
        item.pop("_sortTs", None)

    fit_summary: dict[str, int] = {
        "matched": 0,
        "unmatched": 0,
    }
    for item in recent:
        status = item.get("fitStatus")
        if status in ("in_band", "too_easy"):
            fit_summary["matched"] += 1
        else:
            fit_summary["unmatched"] += 1

    return recent, fit_summary, advanced_theme_ids


def build_fixed_advanced_progress(
    theme_ids: set[str] | None = None,
    goal: int = 5,
) -> dict:
    """Fixed 課程進度：選進階＋評估≥進階＋有效對話完成；assistant 各最多 1，目標 5。"""
    ids = sorted({str(x) for x in (theme_ids or set()) if x is not None and str(x).strip()})
    count = len(ids)
    return {
        "tier": "進階",
        "count": count,
        "goal": goal,
        "met": count >= goal,
        "mode": "fixed",
        "themeIds": ids,
    }

def build_rolling_advanced_progress(
    agent_cefr: list[dict],
    goal: int = 5,
    effective_ids: set[str] | None = None,
) -> dict:
    """rolling：評估達進階／高階且有效對話已完成的 assistant 數。"""
    advanced_ids: set[str] = set()
    eff = effective_ids  # None＝不篩（舊行為）；傳入 set 則必須有效對話完成
    for entry in agent_cefr or []:
        tier = _practice_tier_from_level_key(entry.get("levelKey"))
        if tier not in ("進階", "高階"):
            continue
        aid = entry.get("assistantId")
        if not aid:
            continue
        aid_str = str(aid)
        if eff is not None and aid_str not in eff:
            continue
        advanced_ids.add(aid_str)
    count = len(advanced_ids)
    return {
        "tier": "進階",
        "count": count,
        "goal": goal,
        "met": count >= goal,
        "mode": "rolling",
    }


def _effective_complete_assistant_ids(badge_stats: dict | None) -> set[str]:
    per = (badge_stats or {}).get("perAssistant") or {}
    out: set[str] = set()
    for aid, info in per.items():
        if isinstance(info, dict) and info.get("effectiveRoundComplete"):
            out.add(str(aid))
    return out


def build_cefr_groups_from_agent_cefr(
    agent_cefr: list[dict],
    cefr_meta_map: dict[str, dict],
    conversation_model_map: dict[str, str] | None = None,
) -> list[dict]:
    conv_models = conversation_model_map or {}
    groups: dict[str, list[dict]] = defaultdict(list)
    for x in agent_cefr:
        level = (x.get("levelKey") or "Unknown").strip()
        aid = x.get("assistantId")
        aid_str = str(aid) if aid is not None else ""
        meta = cefr_meta_map.get(aid_str, {})
        conv_id = x.get("activeCefrConversationId")
        conv_id_str = str(conv_id).strip() if conv_id else ""
        model_id = conv_models.get(conv_id_str) or meta.get("modelId") or None
        groups[level].append({
            "assistantId": aid_str,
            "assistantName": meta.get("name") or aid_str,
            "assistantDescription": meta.get("description") or "",
            "activeCefrConversationId": conv_id_str or None,
            "conversationId": conv_id_str or None,
            "modelId": model_id,
            "levelKey": x.get("levelKey"),
            "nextLevelKey": x.get("nextLevelKey"),
            "confidence": x.get("confidence"),
            "updatedAt": x.get("updatedAt"),
            "advice": x.get("advice") or {},
        })

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
    return cefr_groups

# ----------------------------
# Metrics: 英文佔比 / 詞彙豐富度
# 英文佔比 = 英文字母 / (英文字母 + 漢字)；標點、空白、數字不計入。
# 呼叫端應只傳入使用者訊息內容。
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

def conversation_active_duration_min(
    messages: list[dict],
    idle_cutoff_seconds: int = 300,
) -> float:
    """
    計算有效互動時間：
    只累加相鄰訊息間隔 <= idle_cutoff_seconds 的時間。
    預設 300 秒 = 5 分鐘。
    """
    if not messages:
        return 0.0

    times: list[datetime] = []

    for m in messages:
        ts = (
            m.get("updatedAt")
            or m.get("createdAt")
            or m.get("time")
            or m.get("timestamp")
        )
        if isinstance(ts, datetime):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            times.append(ts)

    if len(times) < 2:
        return 0.0

    times.sort()

    total_seconds = 0.0
    for i in range(1, len(times)):
        gap = (times[i] - times[i - 1]).total_seconds()
        if 0 < gap <= idle_cutoff_seconds:
            total_seconds += gap

    return total_seconds / 60.0
# ----------------------------
# Overview API
# ----------------------------
@router.get("/{hfUserId}/overview")
async def student_overview(source: str, hfUserId: str):
    db = get_db_by_source(source)

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

    assistant_meta_map = await build_assistant_meta_map(db, assistant_ids_for_lookup)
    assistant_name_map = {
        aid: (info.get("name") or aid) for aid, info in assistant_meta_map.items()
    }

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

        # active duration: ignore long idle gaps
        active_duration_min = conversation_active_duration_min(msgs, idle_cutoff_seconds=300)
        duration_list.append(active_duration_min)

        for m in msgs:
            # 英文佔比／詞彙豐富度：只計使用者回應
            if m.get("from") == "user":
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

            subset_durs.append(
                conversation_active_duration_min(msgs, idle_cutoff_seconds=300)
            )

            for m in msgs:
                if m.get("from") == "user":
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

    is_fixed_level = normalize_source(source) == "fixed_level"
    recent_practice: list[dict] = []
    fit_summary: dict[str, int] = {}
    advanced_fit_progress: dict = {}
    cefr_groups: list[dict] = []

    if is_fixed_level:
        recent_practice, fit_summary, cefr_adv_themes = build_recent_practice(
            convs, assistant_meta_map
        )
        agent_cefr = []
    else:
        agent_cefr = user.get("agentCefr") or []
        cefr_assistant_ids = [
            x.get("assistantId") for x in agent_cefr if x.get("assistantId")
        ]
        cefr_meta_map = await build_assistant_meta_map(db, cefr_assistant_ids)
        conv_ids = [
            str(x.get("activeCefrConversationId"))
            for x in agent_cefr
            if x.get("activeCefrConversationId")
        ]
        conv_model_map = await build_conversation_model_map(db, conv_ids)
        cefr_groups = build_cefr_groups_from_agent_cefr(
            agent_cefr, cefr_meta_map, conv_model_map
        )
        cefr_adv_themes = set()
    # ---- badge data（定義來自 Mongo badges）
    badge_definitions = resolve_badge_definitions(await load_badge_definitions(db))
    badge_payload = await build_badge_payload(
        db, user, user.get("badge") or {}, hfUserId, source, badge_definitions
    )
    # 課程進度前提：有效對話完成
    effective_done_ids = _effective_complete_assistant_ids(badge_payload.get("stats"))

    if is_fixed_level:
        # 選進階 + 評估≥進階 + 有效對話完成；每個 assistant 最多 1 次，目標 5
        cefr_adv_themes = {aid for aid in cefr_adv_themes if aid in effective_done_ids}
        advanced_fit_progress = build_fixed_advanced_progress(cefr_adv_themes)
    else:
        advanced_fit_progress = build_rolling_advanced_progress(
            agent_cefr,
            effective_ids=effective_done_ids,
        )

    stats_out = {
        **stats,
        "totalMessages": badge_payload["stats"]["totalMessages"],
    }

    badge_topic_details = await build_badge_topic_details(
        db, user, badge_payload["stats"]
    )

    return {
        "hfUserId": normalize_hf_user_id(hfUserId),
        "mongoUserId": str(user_oid),
        "stats": stats_out,
        "badge": badge_payload,
        "badgeDefinitions": badge_definitions,
        "badgeTopicDetails": badge_topic_details,
        "timeseries": timeseries,
        "assistantUsage": assistant_usage,
        "cefrGroups": cefr_groups,
        "recentPractice": recent_practice,
        "fitSummary": fit_summary,
        "advancedFitProgress": advanced_fit_progress,
    }

