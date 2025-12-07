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
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/api/topics")
def list_topics() -> List[str]:
    if not DATA_RAW.exists():
        return []
    return sorted([p.name for p in DATA_RAW.iterdir() if p.is_dir()])


@app.get("/api/topic/{topic}/raw")
def get_raw(topic: str) -> Dict[str, Any]:
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
