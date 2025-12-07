#!/usr/bin/env python3
"""
FastAPI server to serve topics, raw data, analysis, graphs, and comparison artifacts.

Run:
    uvicorn server.main:app --reload
"""

from __future__ import annotations

import json
import os
import sys
import re
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.params import Query

ROOT = Path(__file__).resolve().parent.parent
DATA_RAW = ROOT / "data" / "raw"
DATA_ARTIFACTS = ROOT / "data" / "artifacts"

sys.path.append(str(ROOT / "scripts"))
try:
    from generate_graphs import generate  # type: ignore
except Exception:  # pragma: no cover
    generate = None

app = FastAPI(title="Grokipedia Viz API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Not found: {path.name}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid JSON at {path}") from exc


def topic_dir_or_404(topic: str) -> Path:
    topic_dir = DATA_ARTIFACTS / topic
    if not topic_dir.exists():
        raise HTTPException(status_code=404, detail="Topic not found")
    return topic_dir


def read_raw_texts(topic: str) -> Dict[str, Any]:
    topic_dir = DATA_RAW / topic
    if not topic_dir.exists():
        raise HTTPException(status_code=404, detail="Topic not found")
    grok_path = topic_dir / "grokipedia.txt"
    if not grok_path.exists():
        grok_path = topic_dir / "grokipedia.md"
    wiki_path = topic_dir / "wikipedia.txt"
    metadata_path = topic_dir / "metadata.json"
    return {
        "grokipedia": grok_path.read_text(encoding="utf-8") if grok_path.exists() else "",
        "wikipedia": wiki_path.read_text(encoding="utf-8") if wiki_path.exists() else "",
        "metadata": load_json(metadata_path) if metadata_path.exists() else {},
    }


def build_fallback_segments(raw: Dict[str, Any], topic: str) -> Dict[str, Any]:
    """Create minimal paragraph-based segments when segments.json is missing."""
    def to_segments(text: str, source: str) -> List[Dict[str, Any]]:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
        segments: List[Dict[str, Any]] = []
        cursor = 0
        for idx, para in enumerate(paragraphs):
            # approximate offsets using find from current cursor
            start = text.find(para, cursor)
            end = start + len(para) if start != -1 else cursor + len(para)
            cursor = end
            segments.append(
                {
                    "id": f"{source}-{idx}",
                    "source": source,
                    "text": para,
                    "start": start if start >= 0 else None,
                    "end": end if start >= 0 else None,
                    "entities": [],
                    "metrics": {},
                }
            )
        return segments

    return {
        "meta": {"topic": topic, "generated": "fallback"},
        "segments": {
            "grokipedia": to_segments(raw.get("grokipedia", ""), "grokipedia"),
            "wikipedia": to_segments(raw.get("wikipedia", ""), "wikipedia"),
        },
    }


@app.get("/api/topics")
def list_topics() -> List[str]:
    if not DATA_RAW.exists():
        return []
    return sorted([p.name for p in DATA_RAW.iterdir() if p.is_dir()])


@app.get("/api/topic/{topic}/raw")
def get_raw(topic: str) -> Dict[str, Any]:
    return read_raw_texts(topic)


@app.get("/api/topic/{topic}/analysis")
def get_analysis(topic: str) -> Dict[str, Any]:
    path = DATA_ARTIFACTS / topic / "analysis.json"
    return load_json(path)


@app.get("/api/topic/{topic}/graphs")
def get_graphs(topic: str) -> Dict[str, Any]:
    grok_path = DATA_ARTIFACTS / topic / "grokipedia_graph.json"
    wiki_path = DATA_ARTIFACTS / topic / "wikipedia_graph.json"
    return {
        "grokipedia": load_json(grok_path),
        "wikipedia": load_json(wiki_path),
    }


@app.get("/api/topic/{topic}/comparison")
def get_comparison(topic: str) -> Dict[str, Any]:
    path = DATA_ARTIFACTS / topic / "comparison.json"
    return load_json(path)


@app.get("/api/topic/{topic}/embeddings")
def get_embeddings(topic: str) -> Dict[str, Any]:
    path = DATA_ARTIFACTS / topic / "embeddings.json"
    return load_json(path)


@app.get("/api/topic/{topic}/segments")
def get_segments(topic: str) -> Dict[str, Any]:
    topic_dir = topic_dir_or_404(topic)
    path = topic_dir / "segments.json"
    if path.exists():
        return load_json(path)
    # fallback: derive simple paragraph segments from raw text to avoid 404
    raw = read_raw_texts(topic)
    return build_fallback_segments(raw, topic)


@app.get("/api/topic/{topic}/search")
def search_topic(
    topic: str,
    query: str = Query(..., min_length=2, description="Substring to search for"),
    kind: str = Query("entity", pattern="^(entity|relation|claim)$"),
) -> Dict[str, Any]:
    """Lightweight substring search over graph nodes/edges; best-effort convenience API."""
    topic_dir = topic_dir_or_404(topic)
    try:
        graphs = {
            "grokipedia": load_json(topic_dir / "grokipedia_graph.json"),
            "wikipedia": load_json(topic_dir / "wikipedia_graph.json"),
        }
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Failed to load graphs: {exc}") from exc

    q = query.lower()
    matches: List[Dict[str, Any]] = []
    if kind == "entity":
        for source, graph in graphs.items():
            for node in graph.get("nodes", []):
                label = str(node.get("label") or node.get("id") or "")
                if q in label.lower():
                    matches.append(
                        {
                            "id": node.get("id"),
                            "label": label,
                            "source": source,
                            "type": node.get("type"),
                            "sentiment": node.get("attrs", {}).get("sentiment"),
                            "salience": node.get("attrs", {}).get("salience"),
                        }
                    )
    else:
        # relation/claim search over edges/predicates
        for source, graph in graphs.items():
            for edge in graph.get("edges", []):
                label = str(edge.get("label") or "")
                if q in label.lower():
                    matches.append(
                        {
                            "id": edge.get("id"),
                            "label": label,
                            "source": source,
                            "type": edge.get("type"),
                            "src": edge.get("src"),
                            "dst": edge.get("dst"),
                            "confidence": edge.get("attrs", {}).get("confidence"),
                        }
                    )
    return {"query": query, "kind": kind, "results": matches}


@app.post("/api/topic/{topic}/recompute")
def recompute(topic: str) -> Dict[str, str]:
    if generate is None:
        raise HTTPException(status_code=500, detail="Graph generator unavailable")
    try:
        generate(topic)
        return {"status": "ok"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="analysis.json not found for topic")
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc))
