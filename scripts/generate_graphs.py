#!/usr/bin/env python3
"""
Generate per-source graphs and comparison artifacts from analysis.json.

Usage:
    python scripts/generate_graphs.py --topic COVID-19_lab_leak_theory
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from sentence_transformers import SentenceTransformer
import umap

ROOT = Path(__file__).resolve().parent.parent
DATA_ARTIFACTS = ROOT / "data" / "artifacts"


def canonical(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")


def build_graph(analysis: Dict[str, object], source: str) -> Dict[str, object]:
    art = analysis.get("articles", {}).get(source, {}) or {}
    entities = art.get("entities", []) or []
    relations = art.get("relations", []) or []

    nodes = []
    for ent in entities:
        name = ent.get("name", "")
        node_id = canonical(name) or name
        nodes.append(
            {
                "id": node_id,
                "type": "entity",
                "label": name,
                "source": source,
                "attrs": {
                    "sentiment": ent.get("sentiment"),
                    "salience": ent.get("salience"),
                    "aliases": ent.get("aliases") if isinstance(ent.get("aliases"), list) else [],
                },
            }
        )

    edges = []
    for rel in relations:
        subj = canonical(rel.get("subject", "") or "unknown")
        obj = canonical(rel.get("object", "") or "unknown")
        pred = rel.get("predicate", "") or ""
        edge_id = f"{subj}__{pred}__{obj}"
        edges.append(
            {
                "id": edge_id,
                "src": subj,
                "dst": obj,
                "type": "relation",
                "label": pred,
                "source": source,
                "attrs": {
                    "evidence_span": rel.get("evidence"),
                },
            }
        )

    meta = {
        "topic": analysis.get("topic"),
        "source": source,
        "model": analysis.get("model"),
        "generated_at": analysis.get("generated_at"),
    }
    stats = {
        "node_count": len(nodes),
        "edge_count": len(edges),
    }
    return {"meta": meta, "nodes": nodes, "edges": edges, "stats": stats}


def compute_comparison(grok_graph: Dict[str, object], wiki_graph: Dict[str, object]) -> Dict[str, object]:
    g_nodes = {n["id"] for n in grok_graph["nodes"]}
    w_nodes = {n["id"] for n in wiki_graph["nodes"]}
    node_intersection = sorted(g_nodes & w_nodes)
    node_union = g_nodes | w_nodes
    node_jaccard = len(node_intersection) / len(node_union) if node_union else 0.0

    def edge_key(e: Dict[str, object]) -> Tuple[str, str, str]:
        return (e.get("src", ""), e.get("label", ""), e.get("dst", ""))

    g_edges = {edge_key(e) for e in grok_graph["edges"]}
    w_edges = {edge_key(e) for e in wiki_graph["edges"]}
    edge_intersection = sorted(g_edges & w_edges)
    edge_union = g_edges | w_edges
    edge_jaccard = len(edge_intersection) / len(edge_union) if edge_union else 0.0

    return {
        "entity_overlap": {
            "jaccard": round(node_jaccard, 4),
            "intersection": node_intersection,
            "grok_unique": sorted(g_nodes - w_nodes),
            "wiki_unique": sorted(w_nodes - g_nodes),
        },
        "edge_overlap": {
            "jaccard": round(edge_jaccard, 4),
            "intersection": edge_intersection,
            "grok_unique": sorted(list(g_edges - w_edges)),
            "wiki_unique": sorted(list(w_edges - g_edges)),
        },
    }


def compute_embeddings(graphs: Dict[str, Dict[str, object]], model_name: str = "all-MiniLM-L6-v2") -> List[Dict[str, object]]:
    model = SentenceTransformer(model_name)
    entries = []
    labels = []
    for source, graph in graphs.items():
        for n in graph["nodes"]:
            label = n.get("label", n["id"])
            labels.append(label)
            entries.append(
                {
                    "id": n["id"],
                    "label": label,
                    "source": source,
                    "type": n.get("type", "entity"),
                    "sentiment": n.get("attrs", {}).get("sentiment"),
                    "salience": n.get("attrs", {}).get("salience"),
                }
            )
    if not entries:
        return []
    vectors = model.encode(labels, convert_to_numpy=True, show_progress_bar=False)
    umap_reducer = umap.UMAP(n_components=2, random_state=42, n_neighbors=15, min_dist=0.1)
    coords = umap_reducer.fit_transform(vectors)
    for i, entry in enumerate(entries):
        entry["x"] = float(coords[i, 0])
        entry["y"] = float(coords[i, 1])
    return entries


def generate(topic: str, embed_model: str = "all-MiniLM-L6-v2") -> None:
    analysis_path = DATA_ARTIFACTS / topic / "analysis.json"
    if not analysis_path.exists():
        raise FileNotFoundError(f"Missing analysis: {analysis_path}")
    analysis = json.loads(analysis_path.read_text(encoding="utf-8"))

    grok_graph = build_graph(analysis, "grokipedia")
    wiki_graph = build_graph(analysis, "wikipedia")
    comparison = compute_comparison(grok_graph, wiki_graph)
    embeddings = compute_embeddings({"grokipedia": grok_graph, "wikipedia": wiki_graph}, model_name=embed_model)

    out_dir = DATA_ARTIFACTS / topic
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "grokipedia_graph.json").write_text(json.dumps(grok_graph, indent=2), encoding="utf-8")
    (out_dir / "wikipedia_graph.json").write_text(json.dumps(wiki_graph, indent=2), encoding="utf-8")
    (out_dir / "comparison.json").write_text(json.dumps(comparison, indent=2), encoding="utf-8")
    (out_dir / "embeddings.json").write_text(json.dumps({"model": embed_model, "points": embeddings}, indent=2), encoding="utf-8")
    print(f"Wrote graphs and comparison to {out_dir}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate graphs and comparison artifacts from analysis.json")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--embed-model", default="all-MiniLM-L6-v2")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    generate(args.topic, embed_model=args.embed_model)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
