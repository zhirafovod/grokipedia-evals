#!/usr/bin/env python3
"""
Extract entities, relations, claims, and sentiment from downloaded articles using xAI SDK.

Usage:
    python scripts/run_extraction.py --topic COVID-19_lab_leak_theory
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

from dotenv import load_dotenv
from xai_sdk import Client, chat
from sentence_transformers import SentenceTransformer, util


ROOT = Path(__file__).resolve().parent.parent
DATA_RAW = ROOT / "data" / "raw"
DATA_OUT = ROOT / "data" / "artifacts"

SYSTEM_PROMPT = """You are a careful analyst. Given one article, extract concise structured data.
Return strict JSON with keys: entities, relations, claims, sentiment.
- entities: up to 20 items {name, type, salience (0-1), sentiment in [positive, neutral, negative]}.
- relations: up to 15 items {subject, predicate, object, evidence (short quote or clause)}.
- claims: up to 12 items {summary, stance (pro/neutral/con), evidence_snippet}.
- sentiment: {overall in [positive, neutral, negative], score between -1 and 1, notes}.
Keep text terse; do not invent facts beyond the article. Use the article wording for evidence snippets.
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run extraction on a downloaded Grokipedia/Wikipedia pair.")
    parser.add_argument("--topic", required=True, help="Topic slug under data/raw/")
    parser.add_argument("--model", default="grok-3", help="xAI model name (default: grok-3)")
    parser.add_argument("--max-chars", type=int, default=12000, help="Max characters from each article to send to the model")
    parser.add_argument("--out-dir", default=str(DATA_OUT), help="Base output directory for artifacts")
    parser.add_argument("--user", default="local-dev", help="User tag for telemetry")
    parser.add_argument("--embed-model", default="all-MiniLM-L6-v2", help="SentenceTransformer model for entity embeddings")
    return parser.parse_args()


def load_article(topic: str, filename: str, max_chars: int) -> Tuple[str, Path]:
    path = DATA_RAW / topic / filename
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")
    text = path.read_text(encoding="utf-8")
    truncated = text[:max_chars]
    return truncated, path


def run_llm_extract(client: Client, model: str, article_text: str, source: str, user_tag: str) -> Dict[str, object]:
    user_prompt = f"""Source: {source}
Return JSON only.
Article (truncated if long):
\"\"\"{article_text}\"\"\""""
    chat_req = client.chat.create(
        model=model,
        messages=[
            chat.system(SYSTEM_PROMPT),
            chat.user(user_prompt),
        ],
        response_format="json_object",
        temperature=0.2,
        user=user_tag,
    )
    response = chat_req.sample()
    try:
        return json.loads(response.content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {exc}") from exc


def normalize_names(entities: List[Dict[str, object]]) -> List[str]:
    names: List[str] = []
    for ent in entities or []:
        name = canonical(str(ent.get("name", "")))
        if name:
            names.append(name)
    return names


def compute_entity_overlap(grok_entities: List[Dict[str, object]], wiki_entities: List[Dict[str, object]]) -> Dict[str, object]:
    grok_names = set(normalize_names(grok_entities))
    wiki_names = set(normalize_names(wiki_entities))
    if not grok_names and not wiki_names:
        return {"jaccard": 0.0, "intersection": [], "grok_count": 0, "wiki_count": 0}
    intersection = sorted(grok_names & wiki_names)
    union = grok_names | wiki_names
    jaccard = len(intersection) / len(union) if union else 0.0
    return {
        "jaccard": round(jaccard, 4),
        "intersection": intersection,
        "grok_count": len(grok_names),
        "wiki_count": len(wiki_names),
    }


def canonical(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")


def compute_entity_similarity(
    grok_entities: List[Dict[str, object]], wiki_entities: List[Dict[str, object]], model: SentenceTransformer, model_name: str
) -> Dict[str, object]:
    grok_names = [ent.get("name", "") for ent in grok_entities if ent.get("name")]
    wiki_names = [ent.get("name", "") for ent in wiki_entities if ent.get("name")]
    if not grok_names or not wiki_names:
        return {"matches": [], "model": model_name}

    grok_emb = model.encode(grok_names, convert_to_tensor=True, show_progress_bar=False)
    wiki_emb = model.encode(wiki_names, convert_to_tensor=True, show_progress_bar=False)
    sim_matrix = util.cos_sim(grok_emb, wiki_emb)

    matches: List[Dict[str, object]] = []
    for i, g_name in enumerate(grok_names):
        j = int(sim_matrix[i].argmax())
        score = float(sim_matrix[i][j])
        matches.append(
            {
                "grok_entity": g_name,
                "wiki_entity": wiki_names[j],
                "score": round(score, 4),
            }
        )

    matches = sorted(matches, key=lambda x: x["score"], reverse=True)[:20]
    return {
        "matches": matches,
        "model": model_name,
    }


def main() -> int:
    args = parse_args()
    load_dotenv()
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        raise RuntimeError("XAI_API_KEY is not set (load .env or export it).")

    client = Client(api_key=api_key)
    embed_model = SentenceTransformer(args.embed_model)
    out_dir = Path(args.out_dir) / args.topic
    out_dir.mkdir(parents=True, exist_ok=True)

    grok_text, grok_path = load_article(args.topic, "grokipedia.txt", args.max_chars)
    wiki_text, wiki_path = load_article(args.topic, "wikipedia.txt", args.max_chars)

    grok_data = run_llm_extract(client, args.model, grok_text, "Grokipedia", args.user)
    wiki_data = run_llm_extract(client, args.model, wiki_text, "Wikipedia", args.user)

    entity_overlap = compute_entity_overlap(grok_data.get("entities", []), wiki_data.get("entities", []))
    entity_similarity = compute_entity_similarity(
        grok_data.get("entities", []), wiki_data.get("entities", []), embed_model, args.embed_model
    )

    metrics = {
        "entity_overlap": entity_overlap,
        "entity_similarity": entity_similarity,
        "claims_count": {
            "grokipedia": len(grok_data.get("claims", [])),
            "wikipedia": len(wiki_data.get("claims", [])),
        },
    }

    artifact = {
        "topic": args.topic,
        "model": args.model,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "inputs": {
            "grokipedia_path": str(grok_path),
            "wikipedia_path": str(wiki_path),
            "max_chars": args.max_chars,
            "embed_model": args.embed_model,
        },
        "articles": {
            "grokipedia": grok_data,
            "wikipedia": wiki_data,
        },
        "metrics": metrics,
    }

    out_path = out_dir / "analysis.json"
    out_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    print(f"Saved analysis to: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
