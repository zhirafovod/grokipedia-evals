#!/usr/bin/env python3
"""
Local Streamlit viewer for Grokipedia/Wikipedia article pairs stored in data/raw/.

Usage:
    streamlit run app/local_viewer.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional, Tuple, Any

import streamlit as st


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_ROOT = BASE_DIR / "data" / "raw"
ARTIFACT_ROOT = BASE_DIR / "data" / "artifacts"


def list_topics(data_root: Path) -> Tuple[str, ...]:
    """Return sorted topic slugs found under data/raw."""
    if not data_root.exists():
        return tuple()
    topics = [p.name for p in data_root.iterdir() if p.is_dir()]
    return tuple(sorted(topics))


def load_metadata(topic_dir: Path) -> Dict[str, object]:
    meta_path = topic_dir / "metadata.json"
    if meta_path.exists():
        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def pick_grok_file(topic_dir: Path) -> Optional[Path]:
    for name in ("grokipedia.txt", "grokipedia.md"):
        candidate = topic_dir / name
        if candidate.exists():
            return candidate
    return None


def load_article_content(topic_dir: Path) -> Tuple[str, str, Dict[str, object]]:
    """Load grok and wiki content plus metadata; empty strings if missing."""
    metadata = load_metadata(topic_dir)
    grok_path = pick_grok_file(topic_dir)
    wiki_path = topic_dir / "wikipedia.txt"
    grok_text = grok_path.read_text(encoding="utf-8") if grok_path and grok_path.exists() else ""
    wiki_text = wiki_path.read_text(encoding="utf-8") if wiki_path.exists() else ""
    return grok_text, wiki_text, metadata


def load_analysis(topic: str) -> Optional[Dict[str, Any]]:
    path = ARTIFACT_ROOT / topic / "analysis.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def render_sidebar(topics: Tuple[str, ...]) -> Optional[str]:
    st.sidebar.header("Dataset")
    st.sidebar.write("Browsing article pairs from `data/raw/`.")
    if not topics:
        st.sidebar.warning("No topics found. Run download_pair.py first.")
        return None
    topic = st.sidebar.selectbox("Select topic", topics, index=0)
    return topic


def render_metadata(metadata: Dict[str, object]) -> None:
    if not metadata:
        st.info("No metadata found for this topic.")
        return
    st.subheader("Metadata")
    st.json(metadata, expanded=False)


def render_entities(analysis: Dict[str, Any]) -> None:
    st.subheader("Entities (from extraction)")
    cols = st.columns(2)
    for idx, (label, color) in enumerate((("Grokipedia", "#eef6ff"), ("Wikipedia", "#fff6ee"))):
        with cols[idx]:
            entities = analysis.get("articles", {}).get(label.lower(), {}).get("entities", [])
            if entities:
                st.write(f"{label} ({len(entities)})")
                st.dataframe(entities, hide_index=True, use_container_width=True)
            else:
                st.warning(f"No entities found for {label.lower()}.")

    overlap = analysis.get("metrics", {}).get("entity_overlap")
    if overlap:
        st.markdown(
            f"**Entity overlap (Jaccard):** {overlap.get('jaccard', 0):.3f} "
            f"| intersection: {len(overlap.get('intersection', []))} "
            f"| grok: {overlap.get('grok_count', 0)} | wiki: {overlap.get('wiki_count', 0)}"
        )
        if overlap.get("intersection"):
            st.caption("Common entities")
            st.code(", ".join(overlap["intersection"]))


def build_relation_graph(relations: list[dict], title: str, color: str = "#2b6cb0") -> str:
    """Build a Graphviz DOT string for relations."""
    lines = [f'digraph "{title}" {{', "rankdir=LR;", 'node [shape=box, style="rounded,filled"];']
    for rel in relations[:20]:
        subj = rel.get("subject", "Unknown").replace('"', "'")
        obj = rel.get("object", "Unknown").replace('"', "'")
        pred = rel.get("predicate", "").replace('"', "'")
        lines.append(f'"{subj}" -> "{obj}" [label="{pred}", color="{color}"];')
    lines.append("}")
    return "\n".join(lines)


def build_unified_graph(grok_rel: list[dict], wiki_rel: list[dict], common_entities: set[str]) -> str:
    """Graphviz DOT showing both sources; common entities are highlighted."""
    lines = [
        'digraph "Unified" {',
        "rankdir=LR;",
        'node [shape=box, style="rounded,filled"];',
    ]

    def node_attrs(name: str, source_color: str) -> str:
        base = f'fillcolor="{source_color}"'
        if name.lower().strip() in common_entities:
            base = 'fillcolor="#c7f9cc", color="#15803d", penwidth=2'
        return base

    for rel in grok_rel[:15]:
        subj = rel.get("subject", "Unknown").replace('"', "'")
        obj = rel.get("object", "Unknown").replace('"', "'")
        pred = rel.get("predicate", "").replace('"', "'")
        lines.append(f'"{subj}" [{node_attrs(subj, "#e0edff")}];')
        lines.append(f'"{obj}" [{node_attrs(obj, "#e0edff")}];')
        lines.append(f'"{subj}" -> "{obj}" [label="{pred}", color="#2563eb"];')

    for rel in wiki_rel[:15]:
        subj = rel.get("subject", "Unknown").replace('"', "'")
        obj = rel.get("object", "Unknown").replace('"', "'")
        pred = rel.get("predicate", "").replace('"', "'")
        lines.append(f'"{subj}" [{node_attrs(subj, "#fff1e6")}];')
        lines.append(f'"{obj}" [{node_attrs(obj, "#fff1e6")}];')
        lines.append(f'"{subj}" -> "{obj}" [label="{pred}", color="#d97706", style="dashed"];')

    lines.append("}")
    return "\n".join(lines)


def render_relation_graphs(analysis: Dict[str, Any]) -> None:
    st.subheader("Relations (graph view)")
    cols = st.columns(3)
    grok_rel = analysis.get("articles", {}).get("grokipedia", {}).get("relations", [])
    wiki_rel = analysis.get("articles", {}).get("wikipedia", {}).get("relations", [])
    common = set((analysis.get("metrics", {}).get("entity_overlap", {}) or {}).get("intersection", []))

    with cols[0]:
        if grok_rel:
            st.markdown("**Grokipedia relations**")
            dot = build_relation_graph(grok_rel, "Grokipedia", color="#2563eb")
            st.graphviz_chart(dot, use_container_width=True)
        else:
            st.info("No Grokipedia relations available.")
    with cols[1]:
        if wiki_rel:
            st.markdown("**Wikipedia relations**")
            dot = build_relation_graph(wiki_rel, "Wikipedia", color="#d97706")
            st.graphviz_chart(dot, use_container_width=True)
        else:
            st.info("No Wikipedia relations available.")
    with cols[2]:
        if grok_rel or wiki_rel:
            st.markdown("**Unified graph** (common entities highlighted)")
            dot = build_unified_graph(grok_rel, wiki_rel, {c.lower().strip() for c in common})
            st.graphviz_chart(dot, use_container_width=True)
        else:
            st.info("No relations to show unified view.")


def main() -> None:
    st.set_page_config(page_title="Grokipedia vs Wikipedia Viewer", layout="wide")
    st.title("Grokipedia vs Wikipedia Viewer")
    st.caption("Local view of downloaded article pairs stored under data/raw/")

    topics = list_topics(DATA_ROOT)
    topic = render_sidebar(topics)
    if not topic:
        st.stop()

    topic_dir = DATA_ROOT / topic
    analysis = load_analysis(topic)
    grok_text, wiki_text, metadata = load_article_content(topic_dir)

    st.subheader(f"Topic: {topic}")
    col1, col2 = st.columns(2)
    with col1:
        st.markdown("**Grokipedia**")
        if grok_text:
            st.text_area("grokipedia content", grok_text, height=600, label_visibility="collapsed")
        else:
            st.warning("Missing grokipedia.txt/md")
    with col2:
        st.markdown("**Wikipedia**")
        if wiki_text:
            st.text_area("wikipedia content", wiki_text, height=600, label_visibility="collapsed")
        else:
            st.warning("Missing wikipedia.txt")

    if analysis:
        render_entities(analysis)
        render_relation_graphs(analysis)
    else:
        st.info("No analysis artifact found in data/artifacts/<topic>/analysis.json. Run scripts/run_extraction.py first.")

    render_metadata(metadata)


if __name__ == "__main__":
    main()
