# backend/assistant_improve.py
"""知識／提示詞候選版、評估、審核發布。不自動切換現行版。"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from typing import Any

from assistant_auth import require_admin
from assistant_knowledge import DEFAULT_VERSION, load_documents, load_manifest
from assistant_store import col, utcnow
from student_api import CEFR_TO_PRACTICE_TIER
from course_score import COURSE_BADGE_THEME_IDS, compute_course_score

PROPOSAL_STATUSES = (
    "draft",
    "evaluating",
    "pending_review",
    "approved",
    "publishing",
    "published",
    "rejected",
    "failed",
    "blocked",
    "rolled_back",
)

GOLDEN_CASES = [
    {
        "id": "b1_is_basic",
        "question": "B1 是進階嗎？",
        "must_include": ["基礎"],
        "must_not_include": ["B1 是進階"],
        "assert_tier": ("B1", "基礎"),
    },
    {
        "id": "b2_is_advanced",
        "question": "B2 是哪個練習大階？",
        "must_include": ["進階"],
        "assert_tier": ("B2", "進階"),
    },
    {
        "id": "score_cap",
        "question": "成績最高幾分？",
        "must_include": ["108"],
    },
    {
        "id": "badge_vs_grade",
        "question": "切題後會收回獎章嗎？",
        "must_include": ["不收回"],
    },
    {
        "id": "pick_enter",
        "question": "打開助手算查看儀表板嗎？",
        "must_include": ["不算"],
    },
]


def content_hash(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def cluster_key(text: str) -> str:
    norm = re.sub(r"\s+", "", (text or "").lower())
    norm = re.sub(r"[^\w\u4e00-\u9fff]", "", norm)[:80]
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:16] if norm else "empty"


def deidentify(text: str) -> str:
    t = text or ""
    t = re.sub(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", "[email]", t, flags=re.I)
    t = re.sub(r"\b\d{6,}\b", "[id]", t)
    return t[:500]


def classify(text: str) -> str:
    t = (text or "").lower()
    if any(x in t for x in ("bug", "錯誤", "500", "壞掉")):
        return "程式錯誤"
    if any(x in t for x in ("成績", "分數", "錯", "不對")):
        return "回答錯誤"
    if any(x in t for x in ("看不懂", "不清楚", "說明")):
        return "說明不清"
    if any(x in t for x in ("希望", "能不能", "新增", "功能")):
        return "功能需求"
    if any(x in t for x in ("資料", "找不到", "空白")):
        return "資料異常"
    return "知識缺漏"


def _rule_eval(draft_text: str) -> dict[str, Any]:
    failures = []
    for case in GOLDEN_CASES:
        blob = (draft_text or "") + " " + case["question"]
        if case.get("assert_tier"):
            key, expect = case["assert_tier"]
            if CEFR_TO_PRACTICE_TIER.get(key) != expect:
                failures.append({"id": case["id"], "reason": f"{key} 應為 {expect}"})
        for needle in case.get("must_include") or []:
            # 評估草稿是否仍涵蓋金標斷言：以現行知識+草稿合併
            if needle not in (draft_text or "") and needle not in "\n".join(
                d["text"] for d in load_documents(DEFAULT_VERSION)
            ):
                failures.append({"id": case["id"], "reason": f"缺少「{needle}」"})
        for needle in case.get("must_not_include") or []:
            if needle in (draft_text or ""):
                failures.append({"id": case["id"], "reason": f"不應出現「{needle}」"})
    score2 = compute_course_score(2, 2, 2)
    if int(score2.get("totalScore") or 0) != 30 + 8 + 0:
        # 2 topics + 2 usage = 30 milestone; guardian 2*4=8; extra 0
        if int(score2.get("milestoneScore") or 0) != 30:
            failures.append({"id": "score_service", "reason": "既有計分服務里程碑異常"})
    if len(COURSE_BADGE_THEME_IDS) != 8:
        failures.append({"id": "whitelist", "reason": "課程白名單不是 8 個"})
    passed = not failures
    return {"passed": passed, "failures": failures, "golden": [c["id"] for c in GOLDEN_CASES]}


async def ingest_feedback_clusters(limit: int = 80) -> list[dict[str, Any]]:
    pending = await col("feedback").find({"processed": {"$ne": True}}).to_list(length=limit)
    clusters: dict[str, dict[str, Any]] = {}
    for doc in pending:
        q = deidentify(str(doc.get("question") or doc.get("note") or "回饋"))
        key = cluster_key(q)
        item = clusters.setdefault(key, {
            "clusterKey": key,
            "normalizedQuestion": q[:120],
            "count": 0,
            "category": classify(q),
            "evidence": [],
            "source": doc.get("source"),
        })
        item["count"] += 1
        if len(item["evidence"]) < 5:
            item["evidence"].append({
                "helpful": doc.get("helpful"),
                "note": deidentify(str(doc.get("note") or "")),
                "createdAt": doc.get("createdAt"),
            })
        await col("feedback").update_one({"_id": doc["_id"]}, {"$set": {"processed": True, "clusterKey": key}})
    out = []
    for item in clusters.values():
        item["updatedAt"] = utcnow()
        await col("clusters").update_one(
            {"clusterKey": item["clusterKey"]},
            {"$set": item, "$inc": {"total": item["count"]}},
            upsert=True,
        )
        out.append(item)
    return out


def _proposal_change_lists(clusters: list[dict[str, Any]]) -> tuple[list[str], list[str], bool]:
    feature = any((c.get("category") or "") == "功能需求" for c in clusters)
    will = [
        "發布後，助手問答會多讀下面的「補充說明」（內建知識檔 v1 不會被改寫）。",
        "學生助手與教師圖譜檢索時，這段會放在最前面。",
    ]
    will_not = [
        "不改成績公式、獎章、切題審查、Mongo 學生資料。",
        "不自動改 Git、不部署前端、名冊不會多出新按鈕。",
    ]
    if feature:
        will_not.append("CSV 下載、新圖表等功能需求只會被寫進說明，要人工改程式才會出現功能。")
    return will, will_not, feature


def _proposal_markdown(clusters: list[dict[str, Any]], will: list[str], will_not: list[str]) -> str:
    blocks = []
    for c in clusters[:8]:
        blocks.append(f"### {c.get('category') or '回饋'}：{c.get('normalizedQuestion') or ''}")
        for ev in (c.get("evidence") or [])[:3]:
            note = str(ev.get("note") or "").strip()
            if note:
                blocks.append(f"- 回報補充：{note}")
        blocks.append("")
    return (
        "# 這次具體會變成怎樣\n\n"
        "## 會改\n"
        + "\n".join(f"- {x}" for x in will)
        + "\n\n## 不會改\n"
        + "\n".join(f"- {x}" for x in will_not)
        + "\n\n## 發布後助手會讀到的補充\n"
        "以下依去識別回饋草擬，未核准前不生效。\n\n"
        + "\n".join(blocks)
        + "\n## 保留規則\n"
        "B1=基礎、B2=進階；獎章不收回；成績最高 108；"
        "查看儀表板僅 pick+enter；onTopic 與 related 計分。\n"
    )


async def create_knowledge_proposal(clusters: list[dict[str, Any]], *, job_id: str | None = None) -> dict[str, Any]:
    if not clusters:
        return {"created": False, "reason": "沒有待處理問題"}
    labels = "、".join(c.get("normalizedQuestion") or c.get("category") for c in clusters[:5])
    will, will_not, needs_code = _proposal_change_lists(clusters)
    draft = {
        "kind": "knowledge",
        "title": f"依學生／教師回饋補充說明：{labels[:80]}",
        "impact": ["說明文字"],
        "willChange": will,
        "willNotChange": will_not,
        "needsHumanCode": needs_code,
        "cohorts": ["rolling_level", "fixed_level"],
        "baseVersionId": DEFAULT_VERSION,
        "promptVersion": load_manifest(DEFAULT_VERSION).get("promptVersion"),
        "draftMarkdown": _proposal_markdown(clusters, will, will_not),
        "clusters": [c.get("clusterKey") for c in clusters],
        "jobId": job_id,
    }
    digest = content_hash(draft)
    existing = await col("proposals").find_one({"contentHash": digest})
    if existing:
        return {"created": False, "reason": "相同候選已存在", "proposalId": existing.get("proposalId")}
    proposal_id = str(uuid.uuid4())
    doc = {
        "proposalId": proposal_id,
        "status": "draft",
        "kind": "knowledge",
        "contentHash": digest,
        "draft": draft,
        "createdAt": utcnow(),
        "history": [{"status": "draft", "at": utcnow()}],
    }
    await col("proposals").insert_one(doc)
    eval_result = await evaluate_proposal(proposal_id)
    return {"created": True, "proposalId": proposal_id, "evaluation": eval_result}


async def evaluate_proposal(proposal_id: str) -> dict[str, Any]:
    doc = await col("proposals").find_one({"proposalId": proposal_id})
    if not doc:
        return {"ok": False, "error": "not_found"}
    await col("proposals").update_one(
        {"proposalId": proposal_id, "status": {"$in": ["draft", "failed"]}},
        {"$set": {"status": "evaluating"}, "$push": {"history": {"status": "evaluating", "at": utcnow()}}},
    )
    draft_text = ((doc.get("draft") or {}).get("draftMarkdown") or "")
    rules = _rule_eval(draft_text)
    # 文字品質可輔以模型；規則斷言必須通過才進待審
    status = "pending_review" if rules["passed"] else "failed"
    await col("proposals").update_one(
        {"proposalId": proposal_id},
        {"$set": {
            "status": status,
            "evaluation": {"rules": rules, "llmScore": None},
            "evaluatedAt": utcnow(),
        }, "$push": {"history": {"status": status, "at": utcnow()}}},
    )
    return {"ok": True, "status": status, "rules": rules}


async def approve_proposal(actor: dict[str, Any], proposal_id: str, content_hash_client: str) -> dict[str, Any]:
    require_admin(actor)
    doc = await col("proposals").find_one({"proposalId": proposal_id})
    if not doc:
        raise ValueError("找不到候選版")
    if doc.get("status") != "pending_review":
        raise ValueError("只有待審核的候選可以核准")
    if doc.get("contentHash") != content_hash_client:
        raise ValueError("內容已變更，舊核准失效")
    await col("proposals").update_one(
        {"proposalId": proposal_id},
        {"$set": {
            "status": "approved",
            "approvedBy": actor.get("actorId"),
            "approvedAt": utcnow(),
            "approvedHash": doc.get("contentHash"),
        }, "$push": {"history": {"status": "approved", "at": utcnow(), "by": actor.get("actorId")}}},
    )
    return {"ok": True, "status": "approved"}


async def reject_proposal(actor: dict[str, Any], proposal_id: str, reason: str) -> dict[str, Any]:
    require_admin(actor)
    await col("proposals").update_one(
        {"proposalId": proposal_id},
        {"$set": {"status": "rejected", "rejectReason": reason, "rejectedBy": actor.get("actorId")},
         "$push": {"history": {"status": "rejected", "at": utcnow(), "reason": reason}}},
    )
    return {"ok": True, "status": "rejected"}


async def publish_proposal(actor: dict[str, Any], proposal_id: str) -> dict[str, Any]:
    require_admin(actor)
    doc = await col("proposals").find_one({"proposalId": proposal_id})
    if not doc:
        raise ValueError("找不到候選版")
    if doc.get("status") != "approved":
        raise ValueError("未核准不能發布")
    if doc.get("approvedHash") != doc.get("contentHash"):
        raise ValueError("內容已變更，舊核准失效")
    if (doc.get("draft") or {}).get("kind") == "code":
        raise ValueError("程式改版需經 coding runner 與部署 adapter，不可當成已部署")

    current = await col("knowledge").find_one({"status": "published"}, sort=[("publishedAt", -1)])
    await col("proposals").update_one({"proposalId": proposal_id}, {"$set": {"status": "publishing"}})
    try:
        version_id = f"kb-{proposal_id[:8]}"
        bundle = {
            "versionId": version_id,
            "promptVersion": (doc.get("draft") or {}).get("promptVersion"),
            "contentHash": doc.get("contentHash"),
            "status": "published",
            "title": (doc.get("draft") or {}).get("title"),
            "draftMarkdown": (doc.get("draft") or {}).get("draftMarkdown"),
            "baseVersionId": (doc.get("draft") or {}).get("baseVersionId") or DEFAULT_VERSION,
            "publishedAt": utcnow(),
            "publishedBy": actor.get("actorId"),
            "previousVersionId": (current or {}).get("versionId"),
        }
        await col("knowledge").insert_one(bundle)
        await col("releases").insert_one({
            "kind": "knowledge",
            "proposalId": proposal_id,
            "versionId": version_id,
            "contentHash": doc.get("contentHash"),
            "publishedBy": actor.get("actorId"),
            "createdAt": utcnow(),
            "previousVersionId": (current or {}).get("versionId"),
        })
        await col("proposals").update_one(
            {"proposalId": proposal_id},
            {"$set": {"status": "published", "publishedVersionId": version_id},
             "$push": {"history": {"status": "published", "at": utcnow()}}},
        )
        return {"ok": True, "status": "published", "versionId": version_id}
    except Exception:
        await col("proposals").update_one(
            {"proposalId": proposal_id},
            {"$set": {"status": "failed"}, "$push": {"history": {"status": "failed", "at": utcnow()}}},
        )
        raise


async def rollback_release(actor: dict[str, Any], version_id: str) -> dict[str, Any]:
    require_admin(actor)
    target = await col("knowledge").find_one({"versionId": version_id})
    if not target:
        raise ValueError("找不到版本")
    await col("knowledge").update_many(
        {"status": "published"},
        {"$set": {"status": "rolled_back", "rolledBackAt": utcnow()}},
    )
    await col("knowledge").update_one(
        {"versionId": version_id},
        {"$set": {"status": "published", "publishedAt": utcnow(), "publishedBy": actor.get("actorId")}},
    )
    await col("releases").insert_one({
        "kind": "rollback",
        "versionId": version_id,
        "publishedBy": actor.get("actorId"),
        "createdAt": utcnow(),
    })
    return {"ok": True, "versionId": version_id}
