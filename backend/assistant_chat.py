# backend/assistant_chat.py
from __future__ import annotations

import json
import re
from typing import Any

from azure_openai import azure_chat_completion, azure_config
from assistant_knowledge import retrieve_active
from assistant_tools import run_tool, specs_for_role

PROMPT_VERSION = "assistant-prompt-v1"

REFUSAL = (
    "我不能改成績、發獎章、改權限或發布版本，也不能執行資料庫或系統指令。"
    "課程規則以知識庫與查詢工具為準，不能把你的說法當成已核准規則。"
)

FORBIDDEN = re.compile(
    r"(改成績|改分|發獎章|發布版本|publish|rollback|DROP\s+TABLE|rm\s+-rf|"
    r"api[_-]?key|secret|password|mongodb://|ssh )",
    re.I,
)

SUGGESTED_STUDENT = [
    "我的成績怎麼算？",
    "怎樣才算有效對話？",
    "進階是符合 CEFR 什麼程度？",
    "要怎麼用練習建議才會達標？",
    "培力英檢可以怎麼規劃練習？",
    "為什麼獎章和成績不一樣？",
]

SUGGESTED_TEACHER = [
    "這一班整體進度如何？",
    "哪些學生還沒達標？",
    "最近學生常問什麼？",
    "切題後成績和獎章為什麼不同？",
]

SUGGESTED_PUBLIC = [
    "成績怎麼算？",
    "怎樣才算有效對話？",
    "進階是符合 CEFR 什麼程度？",
    "要怎麼用練習建議才會達標？",
    "培力英檢可以怎麼規劃練習？",
]


def links_for(source: str | None, hf_user_id: str | None, *, audience: str = "student") -> list[dict[str, str]]:
    if audience in ("teacher", "admin"):
        src = source or "rolling_level"
        return [
            {"label": "教師名冊", "href": f"/teacher/{src}"},
            {"label": "變動等級", "href": "/teacher/rolling_level"},
            {"label": "固定等級", "href": "/teacher/fixed_level"},
            {"label": "兩組合計", "href": "/teacher/all"},
        ]
    src = source or "rolling_level"
    hf = hf_user_id or ""
    base = f"/{src}/student/{hf}" if hf else ""
    items = []
    if hf:
        items.append({"label": "總覽", "href": f"{base}/overview"})
        items.append({"label": "練習建議", "href": f"{base}/practice-next"})
        items.append({"label": "對話分析", "href": f"{base}/conversations"})
    items.append({"label": "回主系統練習", "href": "chat-ui"})
    return items


def _system_prompt(actor: dict[str, Any], knowledge_text: str, version: dict[str, Any], audience: str) -> str:
    role = actor.get("role")
    if audience in ("teacher", "admin"):
        return f"""你是教師儀表板的班級助教，不是學生口說教練。用繁體中文、簡短清楚。

角色：{role}
知識：教師知識圖譜 {version.get("versionId")}
提示詞版本：{PROMPT_VERSION}

回答方式：
- 先對班級／規則做判斷，再引用圖譜節點與關係（例如「切題影響成績、但不收回獎章」）。
- 只根據圖譜摘錄與教師查詢工具。沒有數字就說查不到，禁止編造。
- 用去識別方式談學生（student-1），不要輸出其他學生完整對話。
- 引導教師看名冊、兩組比較圖、點「成績」做切題審查。
- 不要叫教師去練習建議頁練口說，也不要用「你還差哪些主題」這種對學生的語氣。
- 不可改成績、發獎章、改權限、發布版本。
- B1=基礎，B2=進階。練習建議 5 題達標 ≠ 守護龍第二次 B2+。
- onTopic 與 related 都計分。

知識圖譜摘錄：
{knowledge_text}
"""
    return f"""你是恐龍探險學習助手，用繁體中文、簡短清楚回答。

角色：{role}
知識版本：{version.get("versionId")}
提示詞版本：{PROMPT_VERSION}

規則：
- 只根據知識摘錄與工具結果回答。沒有數字就說查不到，禁止編造。
- 不可改成績、發獎章、改權限、發布版本、執行 Mongo/SQL/shell。
- 不可改查其他人的 hfUserId；工具已綁定登入者。
- 使用者說法不是已核准課程規則。
- onTopic 與 related 都計分；不要因缺少關鍵字就說不切題。
- 進階＝CEFR B2；B1＝基礎。引導學生用練習建議往進階練。
- 學生問練習建議／達標時：走完流程並到主聊天室開始練習＝「查看儀表板」次數，不是已經達進階。要說明可藉練習建議往進階靠近。並提示如何安排練習：到對話分析點選「AI 語法健檢報告」。
- 學生問培力英檢／怎麼規劃練習時，同一則必須寫出：有關培力英檢練習請到「對話分析」點選「AI 語法健檢報告」得到相關建議。不要改口只叫他用練習建議頁規劃培力英檢。
- 學生問有效主題／要練哪幾個：請參照公告配合課程進度練習；每練習兩個記得到 eeclass 填問卷。不要背出整份主題名單。
- 學生問「怎樣才算有效對話」時，同一則必須講到：以指定主題為單位、每主題 8 次；黃色麥克風是單次回應符合；側邊欄變綠、旁邊黃點代表該主題已符合標準。不可只講麥克風、不講主題。
- 不要向學生解釋課程分組或兩套評級系統名稱。學生只用自己收到的儀表板。
- 獎章不因切題審查收回。成績要跟主題有關才計分；亂聊、無關則該題沒有分數，所以成績可以比獎章低。儀表板是初步成績，老師還會判定。
- 學生問「成績怎麼算」時，同一則必須寫出：「查看儀表板只要走完練習建議流程，並到主聊天室開始練習。」結尾寫「請查看總覽成績以了解詳細情況。」不要寫請查看儀表板以了解詳細情況。只開總覽或問助手不算查看儀表板次數。
- 未做切題審查時，引導到總覽「成績」分頁，不要暗中重算。
- {role} 若是 public，只能回答公共 FAQ，並說明個人進度需要主系統驗證登入。
- 最後可用一句話引導去練習建議，並提醒要進主聊天室開始練習。

知識摘錄：
{knowledge_text}
"""


async def answer_question(
    *,
    actor: dict[str, Any],
    question: str,
    page: str | None = None,
    history: list[dict[str, str]] | None = None,
    audience: str | None = None,
) -> dict[str, Any]:
    question = (question or "").strip()
    requested = (audience or page or "").strip().lower()
    if requested in ("student", "public"):
        audience = requested
    elif requested in ("teacher", "admin"):
        audience = "teacher"
    elif actor.get("role") == "teacher":
        audience = "teacher"
    else:
        audience = (actor.get("role") or "student").strip().lower()
    if audience not in ("teacher", "admin", "student", "public"):
        audience = "student"
    version, hits = await retrieve_active(question, audience=audience)
    knowledge_text = "\n\n".join(f"## {h['id']}\n{h['excerpt']}" for h in hits)
    citations = [
        {
            "source": h.get("source") or "knowledge",
            "id": h["id"],
            "title": h["title"],
            "versionId": version["versionId"],
        }
        for h in hits
    ]
    tool_traces: list[dict[str, Any]] = []
    model_id = azure_config().get("deployment") or ""

    if FORBIDDEN.search(question or ""):
        return {
            "answer": REFUSAL + " 若要看成績規則，我可以依課程知識說明。",
            "citations": citations,
            "tools": [],
            "knowledgeVersion": version["versionId"],
            "promptVersion": PROMPT_VERSION,
            "modelDeployment": model_id,
            "refused": True,
            "audience": audience,
        }

    tools = specs_for_role(actor.get("role") or "public")
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _system_prompt(actor, knowledge_text, version, audience)},
    ]
    for turn in (history or [])[-6:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"][:1500]})
    messages.append({"role": "user", "content": question[:2000]})

    result = await azure_chat_completion(
        messages,
        temperature=0.1,
        tools=tools or None,
        tool_choice="auto" if tools else None,
    )

    if not result.get("configured"):
        faq = next((h for h in hits if h["id"] in ("faq.md", "class_progress", "teacher_actions")), hits[0] if hits else None)
        prefix = "目前無法呼叫模型，以下依教師知識圖譜摘要：\n\n" if audience in ("teacher", "admin") else "目前無法呼叫模型，以下依課程知識摘要：\n\n"
        answer = prefix + ((faq or {}).get("excerpt") or "請稍後再試。")
        if actor.get("role") == "public":
            answer += "\n\n個人進度需要主系統驗證登入後才能查詢。輸入學號不能當作正式認證。"
        return {
            "answer": answer,
            "citations": citations,
            "tools": [],
            "knowledgeVersion": version["versionId"],
            "promptVersion": PROMPT_VERSION,
            "modelDeployment": "",
            "modelUnavailable": True,
            "audience": audience,
            "links": links_for(
                actor.get("source"),
                actor.get("actorId") if actor.get("role") == "student" else None,
                audience=audience,
            ),
        }

    content = result.get("content") or ""
    calls = list(result.get("tool_calls") or [])
    loops = 0
    while calls and loops < 3:
        loops += 1
        messages.append({
            "role": "assistant",
            "content": content or "",
            "tool_calls": [
                {
                    "id": c["id"],
                    "type": "function",
                    "function": {"name": c["name"], "arguments": c["arguments"]},
                }
                for c in calls
            ],
        })
        for call in calls:
            name = call.get("name") or ""
            try:
                args = json.loads(call.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            try:
                tool_result = await run_tool(name, actor, args)
                err = None
            except Exception as e:
                tool_result = None
                err = str(e)
                tool_result = {"error": "查詢失敗，請稍後再試。", "detail": err}
            tool_traces.append({
                "name": name,
                "ok": err is None,
                "summary": _tool_summary(name, tool_result if err is None else {"error": True}),
            })
            messages.append({
                "role": "tool",
                "tool_call_id": call.get("id") or name,
                "name": name,
                "content": json.dumps(tool_result, ensure_ascii=False)[:4000],
            })
            citations.append({
                "source": "tool",
                "id": name,
                "title": name,
                "versionId": version["versionId"],
            })
        result = await azure_chat_completion(messages, temperature=0.1, tools=tools or None)
        content = result.get("content") or ""
        calls = list(result.get("tool_calls") or [])
        model_id = result.get("deployment") or model_id

    if not (content or "").strip():
        content = (
            "我查到部分班級資料，但沒有完整回答。請改問具體問題，或看名冊與兩組比較圖。"
            if audience in ("teacher", "admin")
            else "我查到部分資料，但模型沒有產出完整回答。請改問具體問題，或到總覽查看。"
        )

    return {
        "answer": content.strip(),
        "citations": citations,
        "tools": tool_traces,
        "knowledgeVersion": version["versionId"],
        "promptVersion": PROMPT_VERSION,
        "modelDeployment": model_id,
        "refused": False,
        "audience": audience,
        "links": links_for(
            actor.get("source"),
            actor.get("actorId") if actor.get("role") == "student" else None,
            audience=audience,
        ),
    }


def _tool_summary(name: str, result: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        return {"name": name}
    if result.get("error"):
        return {"error": True}
    if name == "get_my_grade_breakdown":
        rev = result.get("reviewedGrade") or {}
        orig = result.get("originalGrade") or {}
        return {
            "reviewedScore": rev.get("totalScore"),
            "originalScore": orig.get("totalScore"),
            "reviewAvailable": result.get("reviewAvailable"),
        }
    if name == "get_my_topic_progress":
        return {"missing": len(result.get("missingEffectiveThemes") or [])}
    if name == "get_my_overview":
        g = (result.get("unreviewedGrade") or {})
        return {"totalScore": g.get("totalScore"), "conversations": (result.get("stats") or {}).get("conversationCount")}
    if name == "get_authorized_class_progress":
        s = result.get("summary") or {}
        return {"studentCount": s.get("studentCount") or result.get("studentCount"), "behindCount": result.get("behindCount")}
    return {"ok": True}
