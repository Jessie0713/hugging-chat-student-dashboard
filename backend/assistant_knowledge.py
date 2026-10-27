# backend/assistant_knowledge.py
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from assistant_store import col, utcnow

KNOWLEDGE_ROOT = Path(__file__).resolve().parent / "knowledge"
DEFAULT_VERSION = "v1"
STUDENT_ACTIVE_KEY = "student-active"
STOP = {"的", "了", "我", "是", "在", "與", "和", "或", "嗎", "呢", "the", "a", "to", "of"}
MAX_FAQ_ITEMS = 40
MAX_FILE_CHARS = 30000


def knowledge_dir(version_id: str = DEFAULT_VERSION) -> Path:
    return KNOWLEDGE_ROOT / version_id


def load_manifest(version_id: str = DEFAULT_VERSION) -> dict[str, Any]:
    path = knowledge_dir(version_id) / "manifest.json"
    return json.loads(path.read_text(encoding="utf-8"))


def load_documents(version_id: str = DEFAULT_VERSION) -> list[dict[str, str]]:
    manifest = load_manifest(version_id)
    docs = []
    for name in manifest.get("files") or []:
        path = knowledge_dir(version_id) / name
        if path.exists():
            docs.append({
                "id": name,
                "title": path.stem,
                "text": path.read_text(encoding="utf-8"),
            })
    return docs


def _tokens(text: str) -> set[str]:
    parts = re.findall(r"[\u4e00-\u9fff]|[A-Za-z0-9]+", (text or "").lower())
    return {p for p in parts if p and p not in STOP and len(p) > 1 or "\u4e00" <= (p[:1] or "") <= "\u9fff"}


def _excerpt(text: str, query: str, size: int = 900) -> str:
    t = text or ""
    if len(t) <= size:
        return t
    idx = -1
    for tok in sorted(_tokens(query), key=len, reverse=True):
        pos = t.lower().find(tok.lower())
        if pos >= 0:
            idx = pos
            break
    if idx <= 0:
        return t[:size]
    start = max(0, idx - 80)
    return t[start : start + size]


def parse_faq(text: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    body = text or ""
    chunks = re.split(r"\n(?=Q:\s*)", body)
    for chunk in chunks:
        block = chunk.strip()
        if not block.startswith("Q:"):
            continue
        head, _, rest = block.partition("\n")
        q = head[2:].strip()
        a = rest.strip()
        if a.startswith("A:"):
            a = a[2:].strip()
        if q:
            items.append({"q": q[:200], "a": a[:4000]})
    return items


def render_faq(items: list[dict[str, str]], header: str = "# 常見問題") -> str:
    lines = [header.strip(), ""]
    for it in items or []:
        q = str((it or {}).get("q") or "").strip()
        a = str((it or {}).get("a") or "").strip()
        if not q:
            continue
        lines.append(f"Q: {q}")
        lines.append(f"A: {a}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def validate_faq_items(items: list[dict[str, str]] | None) -> list[dict[str, str]]:
    cleaned: list[dict[str, str]] = []
    for it in items or []:
        q = str((it or {}).get("q") or "").strip()[:200]
        a = str((it or {}).get("a") or "").strip()[:4000]
        if not q:
            raise ValueError("FAQ 問題不可空白")
        cleaned.append({"q": q, "a": a})
    if len(cleaned) > MAX_FAQ_ITEMS:
        raise ValueError(f"FAQ 太多（最多 {MAX_FAQ_ITEMS} 則）")
    if not cleaned:
        raise ValueError("至少要有一則 FAQ")
    return cleaned


def file_bundle_from_disk(version_id: str = DEFAULT_VERSION) -> dict[str, Any]:
    manifest = load_manifest(version_id)
    files = load_documents(version_id)
    faq = next((f for f in files if f.get("id") == "faq.md"), None)
    return {
        "title": manifest.get("title") or "學生 FAQ",
        "promptVersion": manifest.get("promptVersion") or "assistant-prompt-v1",
        "baseVersionId": version_id,
        "files": files,
        "faqItems": parse_faq((faq or {}).get("text") or ""),
    }


def public_student_bundle(doc: dict[str, Any] | None) -> dict[str, Any]:
    raw = doc or {}
    files = []
    for f in raw.get("files") or []:
        fid = str((f or {}).get("id") or "").strip()[:80]
        if not fid:
            continue
        files.append({
            "id": fid,
            "title": str((f or {}).get("title") or Path(fid).stem)[:80],
            "text": str((f or {}).get("text") or "")[:MAX_FILE_CHARS],
        })
    faq_file = next((f for f in files if f["id"] == "faq.md"), None)
    items = raw.get("faqItems")
    if items is None:
        items = parse_faq((faq_file or {}).get("text") or "")
    return {
        "title": str(raw.get("title") or "學生 FAQ")[:80],
        "promptVersion": str(raw.get("promptVersion") or "assistant-prompt-v1")[:80],
        "baseVersionId": str(raw.get("baseVersionId") or DEFAULT_VERSION)[:40],
        "files": files,
        "faqItems": items,
    }


def student_bundle_meta(doc: dict[str, Any] | None, *, stored: bool) -> dict[str, Any]:
    b = public_student_bundle(doc)
    updated = (doc or {}).get("updatedAt")
    return {
        **b,
        "stored": stored,
        "faqCount": len(b.get("faqItems") or []),
        "fileCount": len(b.get("files") or []),
        "updatedAt": updated.isoformat() if hasattr(updated, "isoformat") else (updated or None),
        "updatedBy": (doc or {}).get("updatedBy"),
        "seededFromFile": bool((doc or {}).get("seededFromFile")),
    }


def validate_student_bundle(raw: dict[str, Any] | None) -> dict[str, Any]:
    b = public_student_bundle(raw)
    items = validate_faq_items(b.get("faqItems"))
    faq_text = render_faq(items)
    files = [f for f in b["files"] if f["id"] != "faq.md"]
    files.append({"id": "faq.md", "title": "faq", "text": faq_text})
    order = {name: i for i, name in enumerate((load_manifest().get("files") or []))}
    files.sort(key=lambda f: order.get(f["id"], 99))
    return {
        "title": b["title"] or "學生 FAQ",
        "promptVersion": b["promptVersion"],
        "baseVersionId": b["baseVersionId"] or DEFAULT_VERSION,
        "files": files,
        "faqItems": items,
    }


def retrieve(query: str, *, version_id: str = DEFAULT_VERSION, limit: int = 4, documents: list[dict[str, str]] | None = None) -> list[dict[str, Any]]:
    q = _tokens(query)
    scored = []
    for doc in (documents if documents is not None else load_documents(version_id)):
        toks = _tokens(doc["text"] + " " + doc["title"])
        overlap = len(q & toks)
        if overlap <= 0 and not q:
            continue
        score = overlap / max(1, len(q)) if q else 0
        # 公共 FAQ 關鍵詞加權
        blob = doc["text"].lower()
        for word in ("成績", "獎章", "切題", "進階", "b1", "b2", "助手", "主題", "有效", "語音", "練習建議", "cefr", "公告", "eeclass", "問卷", "健檢", "語法", "培力", "英檢", "bestep"):
            if word in (query or "").lower() and word in blob:
                score += 0.4
        if score > 0:
            excerpt = _excerpt(doc["text"], query)
            scored.append({**doc, "score": round(score, 3), "excerpt": excerpt})
    scored.sort(key=lambda x: -x["score"])
    if not scored:
        docs = documents if documents is not None else load_documents(version_id)
        return [{**d, "score": 0, "excerpt": _excerpt(d["text"], query)} for d in docs[:limit]]
    return scored[:limit]


async def get_active_knowledge_version() -> dict[str, Any]:
    try:
        doc = await col("knowledge").find_one({"status": "published"}, sort=[("publishedAt", -1)])
    except Exception:
        doc = None
    if doc:
        return {
            "versionId": doc.get("versionId") or DEFAULT_VERSION,
            "promptVersion": doc.get("promptVersion") or "assistant-prompt-v1",
            "contentHash": doc.get("contentHash") or "",
            "title": doc.get("title") or "",
            "draftMarkdown": doc.get("draftMarkdown") or "",
            "baseVersionId": doc.get("baseVersionId") or DEFAULT_VERSION,
        }
    manifest = load_manifest(DEFAULT_VERSION)
    return {
        "versionId": DEFAULT_VERSION,
        "promptVersion": manifest.get("promptVersion") or "assistant-prompt-v1",
        "contentHash": file_bundle_hash(DEFAULT_VERSION),
        "title": manifest.get("title") or DEFAULT_VERSION,
        "draftMarkdown": "",
        "baseVersionId": DEFAULT_VERSION,
    }


async def retrieve_active(
    query: str,
    limit: int = 4,
    *,
    audience: str = "student",
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    version = await get_active_knowledge_version()
    if audience in ("teacher", "admin"):
        from assistant_graph import get_active_graph, retrieve_teacher_graph

        graph = await get_active_graph()
        hits = retrieve_teacher_graph(query, limit=limit, graph=graph)
        version = {
            **version,
            "versionId": f"{version.get('versionId')}+{graph.get('id')}",
            "title": graph.get("title") or version.get("title"),
            "knowledgeKind": "graph",
        }
        extra = (version.get("draftMarkdown") or "").strip()
        if extra:
            hits = [{
                "id": "published-supplement",
                "title": "已發布補充",
                "text": extra,
                "excerpt": extra[:900],
                "score": 2,
                "source": "knowledge",
            }] + hits
        return version, hits[:limit]

    docs = await get_active_documents()
    hits = retrieve(query, documents=docs, limit=limit)
    extra = (version.get("draftMarkdown") or "").strip()
    if extra:
        hits = [{
            "id": f"{version['versionId']}-draft",
            "title": version.get("title") or "已發布補充",
            "text": extra,
            "excerpt": extra[:900],
            "score": 2,
        }] + hits
        hits = hits[:limit]
    return version, hits


def file_bundle_hash(version_id: str) -> str:
    import hashlib

    docs = load_documents(version_id)
    h = hashlib.sha256()
    for doc in docs:
        h.update(doc["id"].encode())
        h.update(b"\n")
        h.update(doc["text"].encode("utf-8"))
    return h.hexdigest()


async def record_published_bundle(version_id: str, actor_id: str, prompt_version: str) -> dict[str, Any]:
    payload = {
        "versionId": version_id,
        "promptVersion": prompt_version,
        "contentHash": file_bundle_hash(version_id),
        "status": "published",
        "title": load_manifest(version_id).get("title"),
        "publishedAt": utcnow(),
        "publishedBy": actor_id,
        "sourceFiles": True,
    }
    await col("knowledge").update_one(
        {"versionId": version_id},
        {"$set": payload},
        upsert=True,
    )
    return payload


async def get_active_documents() -> list[dict[str, str]]:
    try:
        doc = await col("student_knowledge").find_one({"key": STUDENT_ACTIVE_KEY})
        if doc and (doc.get("files") or doc.get("faqItems")):
            return public_student_bundle(doc)["files"]
        seeded = file_bundle_from_disk()
        now = utcnow()
        await col("student_knowledge").update_one(
            {"key": STUDENT_ACTIVE_KEY},
            {
                "$setOnInsert": {
                    "key": STUDENT_ACTIVE_KEY,
                    **seeded,
                    "seededFromFile": True,
                    "updatedBy": "seed",
                    "createdAt": now,
                    "updatedAt": now,
                }
            },
            upsert=True,
        )
        doc = await col("student_knowledge").find_one({"key": STUDENT_ACTIVE_KEY})
        return public_student_bundle(doc or seeded)["files"]
    except Exception:
        return load_documents()


async def get_student_knowledge_for_admin() -> dict[str, Any]:
    try:
        doc = await col("student_knowledge").find_one({"key": STUDENT_ACTIVE_KEY})
    except Exception:
        doc = None
    if doc:
        return student_bundle_meta(doc, stored=True)
    return {**student_bundle_meta(file_bundle_from_disk(), stored=False), "seededFromFile": True}


async def save_student_knowledge(raw: dict[str, Any], *, actor_id: str | None = None, seeded_from_file: bool = False) -> dict[str, Any]:
    incoming = dict(raw or {})
    if not incoming.get("files"):
        try:
            existing = await col("student_knowledge").find_one({"key": STUDENT_ACTIVE_KEY})
        except Exception:
            existing = None
        if existing:
            incoming["files"] = public_student_bundle(existing).get("files") or []
        else:
            incoming["files"] = file_bundle_from_disk().get("files") or []
    payload = validate_student_bundle(incoming)
    now = utcnow()
    await col("student_knowledge").update_one(
        {"key": STUDENT_ACTIVE_KEY},
        {
            "$set": {
                "key": STUDENT_ACTIVE_KEY,
                **payload,
                "seededFromFile": seeded_from_file,
                "updatedBy": actor_id or "admin",
                "updatedAt": now,
            },
            "$setOnInsert": {"createdAt": now},
        },
        upsert=True,
    )
    doc = await col("student_knowledge").find_one({"key": STUDENT_ACTIVE_KEY})
    return student_bundle_meta(doc or payload, stored=True)


async def reset_student_knowledge_from_file(*, actor_id: str | None = None) -> dict[str, Any]:
    return await save_student_knowledge(
        file_bundle_from_disk(),
        actor_id=actor_id or "seed",
        seeded_from_file=True,
    )
