# backend/assistant_api.py
from __future__ import annotations

import hmac
import secrets
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from assistant_auth import (
    actor_from_authorization,
    issue_session,
    public_actor,
    require_admin,
    student_issue_secret,
    teacher_access_code,
    verify_password,
)
from assistant_chat import (
    PROMPT_VERSION,
    SUGGESTED_PUBLIC,
    SUGGESTED_STUDENT,
    SUGGESTED_TEACHER,
    answer_question,
    links_for,
)
from assistant_coding import run_coding_job, runner_config
from assistant_improve import (
    approve_proposal,
    evaluate_proposal,
    publish_proposal,
    reject_proposal,
    rollback_release,
)
from assistant_graph import (
    get_active_graph,
    get_graph_for_admin,
    reset_graph_from_file,
    save_active_graph,
)
from assistant_knowledge import (
    get_active_documents,
    get_student_knowledge_for_admin,
    reset_student_knowledge_from_file,
    save_student_knowledge,
)
from assistant_store import col, expires_at, get_setting, set_setting, utcnow
from mongo_db import get_db_by_source, normalize_source
from student_api import find_user_by_hf_user_id, normalize_hf_user_id

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class TeacherLoginIn(BaseModel):
    code: str = Field(min_length=1, max_length=80)


class StudentIssueIn(BaseModel):
    hfUserId: str = Field(min_length=1, max_length=80)
    source: str = Field(min_length=1, max_length=40)


class ChatIn(BaseModel):
    sessionId: str | None = Field(default=None, max_length=80)
    question: str = Field(min_length=1, max_length=2000)
    page: str | None = Field(default=None, max_length=80)
    source: str | None = Field(default=None, max_length=40)
    audience: str | None = Field(default=None, max_length=20)


class FeedbackIn(BaseModel):
    sessionId: str
    messageId: str | None = None
    helpful: bool | None = None
    note: str | None = Field(default=None, max_length=1000)
    category: str | None = Field(default=None, max_length=80)


class ProposalActionIn(BaseModel):
    contentHash: str | None = None
    reason: str | None = None


class GraphNodeIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=80)
    aliases: list[str] = Field(default_factory=list)
    text: str = Field(default="", max_length=2000)


class GraphEdgeIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_: str = Field(alias="from", min_length=1, max_length=80)
    rel: str = Field(min_length=1, max_length=40)
    to: str = Field(min_length=1, max_length=80)


class GraphIn(BaseModel):
    id: str = Field(default="teacher-graph", max_length=80)
    title: str = Field(default="教師知識圖譜", max_length=80)
    nodes: list[GraphNodeIn]
    edges: list[GraphEdgeIn]


class FaqItemIn(BaseModel):
    q: str = Field(min_length=1, max_length=200)
    a: str = Field(default="", max_length=4000)


class StudentFileIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(default="", max_length=80)
    text: str = Field(default="", max_length=30000)


class StudentKnowledgeIn(BaseModel):
    title: str | None = Field(default=None, max_length=80)
    faqItems: list[FaqItemIn]
    files: list[StudentFileIn] | None = None


class SettingsIn(BaseModel):
    enabled: bool | None = None
    timezone: str | None = None
    hour: int | None = Field(default=None, ge=0, le=23)
    minute: int | None = Field(default=None, ge=0, le=59)
    lookbackDays: int | None = Field(default=None, ge=1, le=90)
    maxItems: int | None = Field(default=None, ge=1, le=500)
    modelBudget: int | None = Field(default=None, ge=0, le=200)


def _actor(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization:
        return public_actor()
    return actor_from_authorization(authorization)


@router.get("/meta")
async def meta(
    authorization: str | None = Header(default=None),
    audience: str | None = Query(default=None),
):
    actor = _actor(authorization)
    page = (audience or "").strip().lower()
    role = actor.get("role") or "public"
    if page in ("teacher", "admin"):
        want = "teacher"
        suggested = SUGGESTED_TEACHER
    elif page == "student":
        want = "student"
        suggested = SUGGESTED_STUDENT
    elif role == "teacher":
        want = "teacher"
        suggested = SUGGESTED_TEACHER
    elif role == "student":
        want = "student"
        suggested = SUGGESTED_STUDENT
    else:
        want = "student"
        suggested = SUGGESTED_PUBLIC
    return {
        "role": actor.get("role"),
        "audience": want,
        "title": "班級助教" if want == "teacher" else "恐龍學習助手",
        "actorId": actor.get("actorId") if actor.get("role") != "student" else None,
        "source": actor.get("source"),
        "suggestedQuestions": suggested,
        "personalDataEnabled": (
            role == "student" if want == "student" else role in ("teacher", "admin")
        ),
        "sso": {
            "moodle": False,
            "chatUi": bool(student_issue_secret()),
            "needed": [
                "DASHBOARD_AUTH_SECRET",
                "DASHBOARD_STUDENT_ISSUE_SECRET 或 Chat UI／Moodle 可驗證登入",
                "管理者請用 scripts/init_admin.py 初始化，不可自行註冊",
            ],
        },
        "promptVersion": PROMPT_VERSION,
        "links": links_for(
            actor.get("source"),
            actor.get("actorId") if actor.get("role") == "student" else None,
            audience=want,
        ),
    }


@router.post("/auth/admin")
async def admin_login(body: LoginIn):
    doc = await col("admins").find_one({"username": body.username.strip()})
    if not doc or not verify_password(body.password, doc.get("passwordHash") or ""):
        raise HTTPException(status_code=401, detail="管理者帳密不正確")
    issued = issue_session(role="admin", actor_id=body.username.strip(), source=None)
    return issued


@router.post("/auth/teacher")
async def teacher_login(body: TeacherLoginIn):
    if body.code.strip() != teacher_access_code():
        raise HTTPException(status_code=401, detail="教師代碼不正確")
    return issue_session(role="teacher", actor_id="teacher", source=None)


@router.post("/auth/student")
async def student_issue(
    body: StudentIssueIn,
    x_student_issue_secret: str | None = Header(default=None, alias="X-Student-Issue-Secret"),
):
    expected = student_issue_secret()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="尚未串接 Chat UI／Moodle 登入。請設定 DASHBOARD_STUDENT_ISSUE_SECRET，不得以輸入學號當作正式認證。",
        )
    got = (x_student_issue_secret or "").strip()
    if len(got) != len(expected) or not hmac.compare_digest(got.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="學生工作階段核發密鑰不正確")
    src = normalize_source(body.source)
    hf = normalize_hf_user_id(body.hfUserId)
    db = get_db_by_source(src)
    user = await find_user_by_hf_user_id(db, hf)
    if not user:
        raise HTTPException(status_code=404, detail="找不到學生")
    return issue_session(role="student", actor_id=hf, source=src)


@router.post("/chat")
async def chat(body: ChatIn, authorization: str | None = Header(default=None)):
    actor = _actor(authorization)
    session_id = (body.sessionId or "").strip() or secrets.token_hex(12)
    now = utcnow()
    sess = await col("sessions").find_one({"sessionId": session_id})
    if sess and sess.get("actorId") not in (actor.get("actorId"), "public") and actor.get("role") != "admin":
        if sess.get("role") != actor.get("role") or sess.get("actorId") != actor.get("actorId"):
            session_id = secrets.token_hex(12)
            sess = None
    if not sess:
        await col("sessions").insert_one({
            "sessionId": session_id,
            "actorId": actor.get("actorId"),
            "role": actor.get("role"),
            "source": actor.get("source") or body.source,
            "page": body.page,
            "createdAt": now,
            "expiresAt": expires_at(),
        })

    prior = await col("messages").find(
        {"sessionId": session_id, "role": {"$in": ["user", "assistant"]}}
    ).sort("createdAt", 1).to_list(length=12)
    history = [{"role": m.get("role"), "content": m.get("content")} for m in prior]

    result = await answer_question(
        actor=actor,
        question=body.question,
        page=body.page,
        history=history,
        audience=body.audience or body.page,
    )
    user_msg_id = secrets.token_hex(8)
    asst_msg_id = secrets.token_hex(8)
    await col("messages").insert_many([
        {
            "messageId": user_msg_id,
            "sessionId": session_id,
            "role": "user",
            "content": body.question[:2000],
            "actorId": actor.get("actorId"),
            "source": actor.get("source") or body.source,
            "page": body.page,
            "createdAt": now,
        },
        {
            "messageId": asst_msg_id,
            "sessionId": session_id,
            "role": "assistant",
            "content": result.get("answer")[:4000],
            "actorId": actor.get("actorId"),
            "source": actor.get("source") or body.source,
            "page": body.page,
            "knowledgeVersion": result.get("knowledgeVersion"),
            "promptVersion": result.get("promptVersion"),
            "modelDeployment": result.get("modelDeployment"),
            "tools": result.get("tools") or [],
            "citations": result.get("citations") or [],
            "createdAt": utcnow(),
        },
    ])
    return {
        "sessionId": session_id,
        "messageId": asst_msg_id,
        **result,
    }


@router.post("/feedback")
async def feedback(body: FeedbackIn, authorization: str | None = Header(default=None)):
    actor = _actor(authorization)
    msg = None
    if body.messageId:
        msg = await col("messages").find_one({"messageId": body.messageId, "sessionId": body.sessionId})
    question = ""
    if msg:
        prev = await col("messages").find({
            "sessionId": body.sessionId,
            "role": "user",
            "createdAt": {"$lte": msg.get("createdAt")},
        }).sort("createdAt", -1).to_list(length=1)
        if prev:
            question = prev[0].get("content") or ""
    note = (body.note or "")[:1000]
    is_plain_vote = body.helpful is not None and not note.strip() and body.category != "issue"
    if is_plain_vote and body.messageId:
        now = utcnow()
        vote_q = {
            "sessionId": body.sessionId,
            "messageId": body.messageId,
            "category": {"$nin": ["issue"]},
        }
        existing = await col("feedback").find(vote_q).sort("createdAt", -1).to_list(length=50)
        payload = {
            "sessionId": body.sessionId,
            "messageId": body.messageId,
            "helpful": body.helpful,
            "note": "",
            "category": "vote",
            "question": question[:300],
            "actorId": actor.get("actorId"),
            "role": actor.get("role"),
            "source": actor.get("source"),
            "processed": False,
            "updatedAt": now,
        }
        if existing:
            keep_id = existing[0]["_id"]
            extras = [x["_id"] for x in existing[1:]]
            if extras:
                await col("feedback").delete_many({"_id": {"$in": extras}})
            await col("feedback").update_one({"_id": keep_id}, {"$set": payload})
            return {"ok": True}
        await col("feedback").insert_one({**payload, "createdAt": now})
        return {"ok": True}
    doc = {
        "sessionId": body.sessionId,
        "messageId": body.messageId,
        "helpful": body.helpful,
        "note": note,
        "category": body.category,
        "question": question[:300],
        "actorId": actor.get("actorId"),
        "role": actor.get("role"),
        "source": actor.get("source"),
        "processed": False,
        "createdAt": utcnow(),
    }
    await col("feedback").insert_one(doc)
    return {"ok": True}


@router.get("/admin/overview")
async def admin_overview(authorization: str | None = Header(default=None)):
    actor = require_admin(_actor(authorization))
    settings = await get_setting("improvement", {
        "enabled": False,
        "timezone": "Asia/Taipei",
        "hour": 3,
        "minute": 0,
        "lookbackDays": 7,
        "maxItems": 80,
        "modelBudget": 20,
    })
    published = await col("knowledge").find({"status": "published"}).sort("publishedAt", -1).to_list(length=10)
    history = await col("releases").find({}).sort("createdAt", -1).to_list(length=20)
    proposals = await col("proposals").find({}).sort("createdAt", -1).to_list(length=30)
    clusters = await col("clusters").find({}).sort("updatedAt", -1).to_list(length=30)
    jobs = await col("jobs").find({}).sort("createdAt", -1).to_list(length=20)
    feedback_docs = await col("feedback").find({}).sort("createdAt", -1).to_list(length=80)
    feedback_total = await col("feedback").count_documents({})
    feedback_open = await col("feedback").count_documents({"processed": {"$ne": True}})

    def slim(doc):
        d = dict(doc)
        d.pop("_id", None)
        created = d.get("createdAt")
        if hasattr(created, "isoformat"):
            d["createdAt"] = created.isoformat()
        updated = d.get("updatedAt")
        if hasattr(updated, "isoformat"):
            d["updatedAt"] = updated.isoformat()
        return d

    def slim_feedback(doc):
        d = slim(doc)
        d.pop("sessionId", None)
        d.pop("actorId", None)
        return d

    return {
        "actor": actor.get("actorId"),
        "settings": settings,
        "published": [slim(x) for x in published],
        "releases": [slim(x) for x in history],
        "proposals": [slim(x) for x in proposals],
        "clusters": [slim(x) for x in clusters],
        "jobs": [slim(x) for x in jobs],
        "feedback": [slim_feedback(x) for x in feedback_docs],
        "feedbackCounts": {
            "total": feedback_total,
            "unprocessed": feedback_open,
            "helpful": sum(1 for x in feedback_docs if x.get("helpful") is True),
            "unhelpful": sum(1 for x in feedback_docs if x.get("helpful") is False),
        },
        "codingRunner": {
            **(await run_coding_job({"title": "說明文字預覽", "paths": ["backend/knowledge/"]})),
            "gitRemoteSet": bool(runner_config().get("gitRemote")),
            "ciTokenSet": bool(runner_config().get("ciTokenSet")),
        },
        "teacherGraph": await get_graph_for_admin(),
        "studentKnowledge": await get_student_knowledge_for_admin(),
    }


@router.post("/admin/settings")
async def admin_settings(body: SettingsIn, authorization: str | None = Header(default=None)):
    require_admin(_actor(authorization))
    current = await get_setting("improvement", {
        "enabled": False,
        "timezone": "Asia/Taipei",
        "hour": 3,
        "minute": 0,
        "lookbackDays": 7,
        "maxItems": 80,
        "modelBudget": 20,
    })
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    current.update(patch)
    current["timezone"] = current.get("timezone") or "Asia/Taipei"
    await set_setting("improvement", current)
    return {"ok": True, "settings": current}


@router.post("/admin/run-once")
async def admin_run_once(authorization: str | None = Header(default=None)):
    actor = require_admin(_actor(authorization))
    from assistant_worker import run_improvement_job

    result = await run_improvement_job(trigger="manual", actor_id=actor.get("actorId"))
    return result


@router.post("/admin/proposals/{proposal_id}/evaluate")
async def admin_eval(proposal_id: str, authorization: str | None = Header(default=None)):
    require_admin(_actor(authorization))
    return await evaluate_proposal(proposal_id)


@router.post("/admin/proposals/{proposal_id}/approve")
async def admin_approve(
    proposal_id: str,
    body: ProposalActionIn,
    authorization: str | None = Header(default=None),
):
    actor = require_admin(_actor(authorization))
    if not body.contentHash:
        raise HTTPException(status_code=400, detail="核准需綁定 contentHash")
    try:
        return await approve_proposal(actor, proposal_id, body.contentHash)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/admin/proposals/{proposal_id}/reject")
async def admin_reject(
    proposal_id: str,
    body: ProposalActionIn,
    authorization: str | None = Header(default=None),
):
    actor = require_admin(_actor(authorization))
    return await reject_proposal(actor, proposal_id, body.reason or "退回")


@router.post("/admin/proposals/{proposal_id}/publish")
async def admin_publish(proposal_id: str, authorization: str | None = Header(default=None)):
    actor = require_admin(_actor(authorization))
    try:
        return await publish_proposal(actor, proposal_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/admin/rollback/{version_id}")
async def admin_rollback(version_id: str, authorization: str | None = Header(default=None)):
    actor = require_admin(_actor(authorization))
    try:
        return await rollback_release(actor, version_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/admin/graph")
async def admin_get_graph(authorization: str | None = Header(default=None)):
    require_admin(_actor(authorization))
    await get_active_graph()
    return await get_graph_for_admin()


@router.put("/admin/graph")
async def admin_put_graph(body: GraphIn, authorization: str | None = Header(default=None)):
    actor = require_admin(_actor(authorization))
    try:
        return await save_active_graph(body.model_dump(by_alias=True), actor_id=actor.get("actorId"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/admin/graph/reset")
async def admin_reset_graph(authorization: str | None = Header(default=None)):
    actor = require_admin(_actor(authorization))
    return await reset_graph_from_file(actor_id=actor.get("actorId"))


@router.get("/admin/student-knowledge")
async def admin_get_student_knowledge(authorization: str | None = Header(default=None)):
    require_admin(_actor(authorization))
    await get_active_documents()
    return await get_student_knowledge_for_admin()


@router.put("/admin/student-knowledge")
async def admin_put_student_knowledge(body: StudentKnowledgeIn, authorization: str | None = Header(default=None)):
    actor = require_admin(_actor(authorization))
    try:
        return await save_student_knowledge(
            body.model_dump(exclude_none=True),
            actor_id=actor.get("actorId"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/admin/student-knowledge/reset")
async def admin_reset_student_knowledge(authorization: str | None = Header(default=None)):
    actor = require_admin(_actor(authorization))
    return await reset_student_knowledge_from_file(actor_id=actor.get("actorId"))


@router.post("/admin/code-preview")
async def admin_code_preview(authorization: str | None = Header(default=None)):
    require_admin(_actor(authorization))
    return await run_coding_job({"title": "說明文字預覽", "paths": ["backend/knowledge/"]})
