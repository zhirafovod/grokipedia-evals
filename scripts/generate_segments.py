#!/usr/bin/env python3
"""
Generate paragraph-level segments with naive entity span highlights.

Usage:
    python scripts/generate_segments.py --topic COVID-19_lab_leak_theory
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Sequence

ROOT = Path(__file__).resolve().parent.parent
DATA_RAW = ROOT / "data" / "raw"
DATA_ARTIFACTS = ROOT / "data" / "artifacts"


def load_analysis(topic: str) -> Dict[str, object]:
    path = DATA_ARTIFACTS / topic / "analysis.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing analysis.json at {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_raw(topic: str) -> Dict[str, str]:
    topic_dir = DATA_RAW / topic
    if not topic_dir.exists():
        raise FileNotFoundError(f"Missing raw topic directory {topic_dir}")
    grok_path = topic_dir / "grokipedia.txt"
    if not grok_path.exists():
        grok_path = topic_dir / "grokipedia.md"
    wiki_path = topic_dir / "wikipedia.txt"
    return {
        "grokipedia": grok_path.read_text(encoding="utf-8") if grok_path.exists() else "",
        "wikipedia": wiki_path.read_text(encoding="utf-8") if wiki_path.exists() else "",
    }


def paragraph_spans(text: str) -> List[Dict[str, object]]:
    """Split text into paragraphs and track offsets."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
    segments: List[Dict[str, object]] = []
    cursor = 0
    for idx, para in enumerate(paragraphs):
        start = text.find(para, cursor)
        end = start + len(para) if start != -1 else cursor + len(para)
        cursor = end
        segments.append({"idx": idx, "text": para, "start": start if start >= 0 else None, "end": end if end >= 0 else None})
    return segments


def match_entities(text: str, entities: Sequence[Dict[str, object]], offset: int) -> List[Dict[str, object]]:
    """Locate entity surface forms within a block of text."""
    spans: List[Dict[str, object]] = []
    for ent in entities:
        name = str(ent.get("name") or "").strip()
        if not name:
            continue
        pattern = re.escape(name)
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            spans.append(
                {
                    "name": name,
                    "type": ent.get("type"),
                    "start": offset + match.start(),
                    "end": offset + match.end(),
                    "salience": ent.get("salience"),
                    "sentiment": ent.get("sentiment"),
                }
            )
    # Deduplicate overlapping identical spans (basic)
    seen = set()
    unique: List[Dict[str, object]] = []
    for span in spans:
        key = (span["start"], span["end"], span["name"].lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(span)
    return unique


def build_segments(text: str, entities: Sequence[Dict[str, object]], source: str) -> List[Dict[str, object]]:
    segments = []
    for seg in paragraph_spans(text):
        entity_spans = match_entities(seg["text"], entities, seg["start"] or 0)
        segments.append(
            {
                "id": f"{source}-{seg['idx']}",
                "source": source,
                "text": seg["text"],
                "start": seg["start"],
                "end": seg["end"],
                "entities": entity_spans,
                "metrics": {"entity_mentions": len(entity_spans)},
            }
        )
    return segments


def generate_segments(topic: str) -> Dict[str, object]:
    raw = load_raw(topic)
    analysis = load_analysis(topic)
    articles = analysis.get("articles", {})
    grok_entities = articles.get("grokipedia", {}).get("entities", []) or []
    wiki_entities = articles.get("wikipedia", {}).get("entities", []) or []

    segments = {
        "grokipedia": build_segments(raw.get("grokipedia", ""), grok_entities, "grokipedia"),
        "wikipedia": build_segments(raw.get("wikipedia", ""), wiki_entities, "wikipedia"),
    }
    payload = {"meta": {"topic": topic, "generated": analysis.get("generated_at"), "model": analysis.get("model")}, "segments": segments}
    out_path = DATA_ARTIFACTS / topic / "segments.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate segments with entity highlights.")
    parser.add_argument("--topic", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    payload = generate_segments(args.topic)
    print(f"Wrote segments for {args.topic} to {DATA_ARTIFACTS/args.topic/'segments.json'} "
          f"(grok: {len(payload['segments']['grokipedia'])}, wiki: {len(payload['segments']['wikipedia'])})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
