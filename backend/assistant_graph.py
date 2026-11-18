# backend/assistant_graph.py
"""教師助手用輕量知識圖譜：節點＋關係檢索。現行版存在 Mongo，檔案只當種子。"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from assistant_store import col, utcnow

GRAPH_PATH = Path(__file__).resolve().parent / "knowledge" / "teacher" / "graph.json"
ACTIVE_KEY = "teacher-active"
STOP = {"的", "了", "我", "是", "在", "與", "和", "或", "嗎", "呢", "the", "a", "to", "of", "這", "那"}
MAX_NODES = 80
MAX_EDGES = 200


def _tokens(text: str) -> set[str]:
    parts = re.findall(r"[\u4e00-\u9fff]{1,4}|[A-Za-z0-9]+", (text or "").lower())
    return {p for p in parts if p and p not in STOP}


def load_graph_file() -> dict[str, Any]:
    return json.loads(GRAPH_PATH.read_text(encoding="utf-8"))


def load_graph() -> dict[str, Any]:
    """測試與後援：讀檔案種子。正式檢索請用 get_active_graph。"""
    return load_graph_file()


def public_graph(doc: dict[str, Any] | None) -> dict[str, Any]:
    raw = doc or {}
    return {
        "id": raw.get("id") or "teacher-graph",
        "title": raw.get("title") or "教師知識圖譜",
        "nodes": list(raw.get("nodes") or []),
        "edges": list(raw.get("edges") or []),
    }


def graph_meta(doc: dict[str, Any] | None, *, stored: bool) -> dict[str, Any]:
    g = public_graph(doc)
    updated = (doc or {}).get("updatedAt")
    return {
        **g,
        "stored": stored,
        "nodeCount": len(g["nodes"]),
        "edgeCount": len(g["edges"]),
        "updatedAt": updated.isoformat() if hasattr(updated, "isoformat") else (updated or None),
        "updatedBy": (doc or {}).get("updatedBy"),
        "seededFromFile": bool((doc or {}).get("seededFromFile")),
    }


def validate_graph(raw: dict[str, Any] | None) -> dict[str, Any]:
    g = public_graph(raw)
    nodes: list[dict[str, Any]] = []
    seen: set[str] = set()
    for n in g["nodes"]:
        nid = str((n or {}).get("id") or "").strip()
        if not nid:
            raise ValueError("節點 id 不可空白")
        if nid in seen:
            raise ValueError(f"重複節點 id：{nid}")
        seen.add(nid)
        aliases = [str(a).strip() for a in ((n or {}).get("aliases") or []) if str(a).strip()]
        nodes.append({
            "id": nid[:80],
            "label": str((n or {}).get("label") or nid).strip()[:80],
            "aliases": aliases[:20],
            "text": str((n or {}).get("text") or "").strip()[:2000],
        })
    if not nodes:
        raise ValueError("至少要有一個節點")
    if len(nodes) > MAX_NODES:
        raise ValueError(f"節點太多（最多 {MAX_NODES}）")
    edges: list[dict[str, str]] = []
    for e in g["edges"]:
        frm = str((e or {}).get("from") or "").strip()
        to = str((e or {}).get("to") or "").strip()
        rel = str((e or {}).get("rel") or "").strip()[:40]
        if not rel:
            raise ValueError("關係名稱不可空白")
        if frm not in seen or to not in seen:
            raise ValueError(f"關係指向不存在的節點：{frm} → {to}")
        edges.append({"from": frm, "rel": rel, "to": to})
    if len(edges) > MAX_EDGES:
        raise ValueError(f"關係太多（最多 {MAX_EDGES}）")
    gid = str(g.get("id") or "teacher-graph").strip()[:80] or "teacher-graph"
    title = str(g.get("title") or "教師知識圖譜").strip()[:80] or "教師知識圖譜"
    return {"id": gid, "title": title, "nodes": nodes, "edges": edges}


def _node_blob(node: dict[str, Any]) -> str:
    aliases = " ".join(node.get("aliases") or [])
    return f"{node.get('label') or ''} {aliases} {node.get('text') or ''}"


def retrieve_teacher_graph(
    query: str,
    *,
    limit: int = 5,
    graph: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    graph = graph or load_graph_file()
    nodes = {n["id"]: n for n in graph.get("nodes") or [] if n.get("id")}
    edges = graph.get("edges") or []
    q = _tokens(query)
    qtext = (query or "").lower()

    scored: list[tuple[float, str]] = []
    for nid, node in nodes.items():
        blob = _node_blob(node).lower()
        toks = _tokens(blob)
        score = len(q & toks) / max(1, len(q)) if q else 0
        for alias in node.get("aliases") or []:
            if alias.lower() in qtext:
                score += 1.2
        if score > 0:
            scored.append((score, nid))
    scored.sort(reverse=True)
    seed_ids = [nid for _s, nid in scored[:3]] or ["class_progress", "teacher_actions"]
    seed_ids = [nid for nid in seed_ids if nid in nodes] or list(nodes)[:2]

    chosen: dict[str, dict[str, Any]] = {}
    relations: list[str] = []
    for nid in seed_ids:
        node = nodes.get(nid)
        if not node:
            continue
        chosen[nid] = node
        for edge in edges:
            if edge.get("from") == nid or edge.get("to") == nid:
                other = edge["to"] if edge.get("from") == nid else edge["from"]
                if other in nodes and other not in chosen and len(chosen) < limit:
                    chosen[other] = nodes[other]
                src = nodes.get(edge.get("from") or "", {})
                dst = nodes.get(edge.get("to") or "", {})
                relations.append(
                    f"{src.get('label')} —{edge.get('rel')}→ {dst.get('label')}"
                )

    hits = []
    for nid, node in chosen.items():
        rels = [r for r in relations if node.get("label") and node["label"] in r]
        excerpt = node.get("text") or ""
        if rels:
            excerpt += "\n關係：" + "；".join(list(dict.fromkeys(rels))[:4])
        hits.append({
            "id": nid,
            "title": node.get("label") or nid,
            "text": node.get("text") or "",
            "excerpt": excerpt[:900],
            "score": next((s for s, i in scored if i == nid), 0.5),
            "source": "teacher-graph",
        })
    hits.sort(key=lambda x: -float(x.get("score") or 0))
    return hits[:limit]


async def get_active_graph() -> dict[str, Any]:
    try:
        doc = await col("graph").find_one({"key": ACTIVE_KEY})
        if doc:
            return public_graph(doc)
        seeded = validate_graph(load_graph_file())
        now = utcnow()
        await col("graph").update_one(
            {"key": ACTIVE_KEY},
            {
                "$setOnInsert": {
                    "key": ACTIVE_KEY,
                    **seeded,
                    "seededFromFile": True,
                    "updatedBy": "seed",
                    "createdAt": now,
                    "updatedAt": now,
                }
            },
            upsert=True,
        )
        doc = await col("graph").find_one({"key": ACTIVE_KEY})
        return public_graph(doc or seeded)
    except Exception:
        return load_graph_file()


async def get_graph_for_admin() -> dict[str, Any]:
    try:
        doc = await col("graph").find_one({"key": ACTIVE_KEY})
    except Exception:
        doc = None
    if doc:
        return graph_meta(doc, stored=True)
    seeded = load_graph_file()
    return {**graph_meta(seeded, stored=False), "seededFromFile": True}


async def save_active_graph(
    raw: dict[str, Any],
    *,
    actor_id: str | None = None,
    seeded_from_file: bool = False,
) -> dict[str, Any]:
    payload = validate_graph(raw)
    now = utcnow()
    await col("graph").update_one(
        {"key": ACTIVE_KEY},
        {
            "$set": {
                "key": ACTIVE_KEY,
                **payload,
                "seededFromFile": seeded_from_file,
                "updatedBy": actor_id or "admin",
                "updatedAt": now,
            },
            "$setOnInsert": {"createdAt": now},
        },
        upsert=True,
    )
    doc = await col("graph").find_one({"key": ACTIVE_KEY})
    return graph_meta(doc or payload, stored=True)


async def reset_graph_from_file(*, actor_id: str | None = None) -> dict[str, Any]:
    return await save_active_graph(
        load_graph_file(),
        actor_id=actor_id or "seed",
        seeded_from_file=True,
    )
