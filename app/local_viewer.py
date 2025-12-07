#!/usr/bin/env python3
"""
Local Streamlit viewer for Grokipedia/Wikipedia article pairs stored in data/raw/.

Usage:
    streamlit run app/local_viewer.py
"""

from __future__ import annotations

import json
import re
import html
import os
from pathlib import Path
from typing import Dict, Optional, Tuple, Any

import altair as alt
import pandas as pd
import streamlit as st
import streamlit.components.v1 as components
import requests
import difflib


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_ROOT = BASE_DIR / "data" / "raw"
ARTIFACT_ROOT = BASE_DIR / "data" / "artifacts"
BACKEND_URL = os.environ.get("BACKEND_URL")


def list_topics(data_root: Path) -> Tuple[str, ...]:
    """Return sorted topic slugs under data/raw or via backend."""
    if BACKEND_URL:
        try:
            resp = requests.get(f"{BACKEND_URL}/api/topics", timeout=10)
            resp.raise_for_status()
            return tuple(resp.json())
        except Exception:
            return tuple()
    if not data_root.exists():
        return tuple()
    topics = [p.name for p in data_root.iterdir() if p.is_dir()]
    return tuple(sorted(topics))


def load_metadata(topic_dir: Path) -> Dict[str, object]:
    meta_path = topic_dir / "metadata.json"
    if BACKEND_URL:
        try:
            resp = requests.get(f"{BACKEND_URL}/api/topic/{topic_dir.name}/raw", timeout=15)
            resp.raise_for_status()
            return resp.json().get("metadata", {})
        except Exception:
            return {}
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
    if BACKEND_URL:
        try:
            resp = requests.get(f"{BACKEND_URL}/api/topic/{topic_dir.name}/raw", timeout=20)
            resp.raise_for_status()
            payload = resp.json()
            return payload.get("grokipedia", ""), payload.get("wikipedia", ""), payload.get("metadata", {})
        except Exception:
            pass
    metadata = load_metadata(topic_dir)
    grok_path = pick_grok_file(topic_dir)
    wiki_path = topic_dir / "wikipedia.txt"
    grok_text = grok_path.read_text(encoding="utf-8") if grok_path and grok_path.exists() else ""
    wiki_text = wiki_path.read_text(encoding="utf-8") if wiki_path.exists() else ""
    return grok_text, wiki_text, metadata


def load_analysis(topic: str) -> Optional[Dict[str, Any]]:
    path = ARTIFACT_ROOT / topic / "analysis.json"
    if BACKEND_URL:
        try:
            resp = requests.get(f"{BACKEND_URL}/api/topic/{topic}/analysis", timeout=20)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def load_comparison(topic: str) -> Optional[Dict[str, Any]]:
    path = ARTIFACT_ROOT / topic / "comparison.json"
    if BACKEND_URL:
        try:
            resp = requests.get(f"{BACKEND_URL}/api/topic/{topic}/comparison", timeout=20)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def load_embeddings(topic: str) -> Optional[Dict[str, Any]]:
    path = ARTIFACT_ROOT / topic / "embeddings.json"
    if BACKEND_URL:
        try:
            resp = requests.get(f"{BACKEND_URL}/api/topic/{topic}/embeddings", timeout=20)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def load_graphs(topic: str) -> Optional[Dict[str, Any]]:
    grok = ARTIFACT_ROOT / topic / "grokipedia_graph.json"
    wiki = ARTIFACT_ROOT / topic / "wikipedia_graph.json"
    if BACKEND_URL:
        try:
            resp = requests.get(f"{BACKEND_URL}/api/topic/{topic}/graphs", timeout=20)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None
    if not grok.exists() or not wiki.exists():
        return None
    try:
        return {
            "grokipedia": json.loads(grok.read_text(encoding="utf-8")),
            "wikipedia": json.loads(wiki.read_text(encoding="utf-8")),
        }
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

    similarity = analysis.get("metrics", {}).get("entity_similarity", {}) or {}
    matches = similarity.get("matches") or []
    if matches:
        st.markdown("**Top entity alignments (cosine similarity)**")
        st.dataframe(matches, hide_index=True, use_container_width=True)

    sentiment_div = (analysis.get("metrics", {}) or {}).get("sentiment_divergence")
    if sentiment_div:
        st.markdown(
            f"**Sentiment divergence (mean abs diff on shared entities)**: {sentiment_div.get('mean_abs_diff', 0):.3f} "
            f"over {sentiment_div.get('count', 0)} common entities"
        )


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
    """
    Graphviz DOT showing both sources; common entities are highlighted.
    Encodes source via edge color/style and shared entities via green fill/outline.
    """
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


def canonical_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")


def build_highlight_html(text: str, entity_names: set[str], source: str, max_hits_per_entity: int = 2) -> str:
    """Wrap common entities with spans to enable hover sync."""
    if not text or not entity_names:
        return f"<div class='text-pane empty'>No text</div>"

    escaped_segments: list[str] = []
    canon_entities = {canonical_name(n) for n in entity_names if n}
    names_sorted = sorted({n for n in entity_names if n}, key=len, reverse=True)
    if not names_sorted:
        return f"<div class='text-pane'>{html.escape(text)}</div>"

    pattern = re.compile(r"\b(" + "|".join(re.escape(n) for n in names_sorted) + r")\b", flags=re.IGNORECASE)
    counts: Dict[str, int] = {}
    idx = 0
    for match in pattern.finditer(text):
        start, end = match.span()
        escaped_segments.append(html.escape(text[idx:start]))
        raw = match.group(0)
        canon = canonical_name(raw)
        counts[canon] = counts.get(canon, 0) + 1
        if counts[canon] <= max_hits_per_entity and canon in canon_entities:
            escaped_segments.append(
                f"<span class='entity entity-{source}' data-entity='{canon}' data-source='{source}'>{html.escape(raw)}</span>"
            )
        else:
            escaped_segments.append(html.escape(raw))
        idx = end
    escaped_segments.append(html.escape(text[idx:]))
    return "<div class='text-pane'>" + "".join(escaped_segments) + "</div>"


def render_linked_text(analysis: Dict[str, Any], grok_text: str, wiki_text: str) -> None:
    st.subheader("Linked entities in text")
    overlap = analysis.get("metrics", {}).get("entity_overlap", {}) or {}
    common = {canonical_name(n) for n in overlap.get("intersection", [])}
    if not common:
        st.info("No common entities detected to link in text.")
        return

    grok_entities = analysis.get("articles", {}).get("grokipedia", {}).get("entities", [])
    wiki_entities = analysis.get("articles", {}).get("wikipedia", {}).get("entities", [])
    grok_names = {e.get("name", "") for e in grok_entities if canonical_name(e.get("name", "")) in common}
    wiki_names = {e.get("name", "") for e in wiki_entities if canonical_name(e.get("name", "")) in common}

    # Build per-entity metrics map
    metrics_map: Dict[str, Dict[str, object]] = {}
    for ent in grok_entities:
        key = canonical_name(ent.get("name", ""))
        if key in common:
            metrics_map.setdefault(key, {})
            metrics_map[key]["grok_sentiment"] = ent.get("sentiment", "")
            metrics_map[key]["grok_salience"] = ent.get("salience", "")
    for ent in wiki_entities:
        key = canonical_name(ent.get("name", ""))
        if key in common:
            metrics_map.setdefault(key, {})
            metrics_map[key]["wiki_sentiment"] = ent.get("sentiment", "")
            metrics_map[key]["wiki_salience"] = ent.get("salience", "")
    sim_matches = (analysis.get("metrics", {}).get("entity_similarity", {}) or {}).get("matches", []) or []
    for m in sim_matches:
        gkey = canonical_name(m.get("grok_entity", ""))
        wkey = canonical_name(m.get("wiki_entity", ""))
        if gkey == wkey and gkey:
            metrics_map.setdefault(gkey, {})
            metrics_map[gkey]["cosine"] = m.get("score")
        else:
            if gkey:
                metrics_map.setdefault(gkey, {})
                metrics_map[gkey].setdefault("cosine_links", []).append(m)
            if wkey:
                metrics_map.setdefault(wkey, {})
                metrics_map[wkey].setdefault("cosine_links", []).append(m)

    grok_html = build_highlight_html(grok_text, grok_names, "grok")
    wiki_html = build_highlight_html(wiki_text, wiki_names, "wiki")

    component_html = f"""
    <style>
    .linked-container {{
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }}
    .panel {{
        border: 1px solid #ddd;
        padding: 8px;
        border-radius: 8px;
        background: #fafafa;
    }}
    .text-pane {{
        max-height: 400px;
        overflow-y: auto;
        padding: 8px;
        background: white;
        border-radius: 6px;
        border: 1px solid #eee;
        line-height: 1.4;
    }}
    .entity {{
        padding: 1px 3px;
        border-radius: 4px;
        cursor: pointer;
    }}
    .entity-grok {{
        background: #e0edff;
    }}
    .entity-wiki {{
        background: #fff1e6;
    }}
    .entity.hovered {{
        outline: 2px solid #10b981;
        background: #d1fae5 !important;
    }}
    .metrics-box {{
        margin-top: 8px;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: #f9fafb;
        font-size: 13px;
    }}
    </style>
    <div class="linked-container">
        <div class="panel">
            <div><strong>Grokipedia</strong></div>
            {grok_html}
        </div>
        <div class="panel">
            <div><strong>Wikipedia</strong></div>
            {wiki_html}
        </div>
    </div>
    <div class="metrics-box" id="metrics-box">Hover an entity to see metrics...</div>
    <script>
    const spans = document.querySelectorAll('.entity');
    const metrics = {json.dumps(metrics_map)};
    const metricsBox = document.getElementById('metrics-box');
    spans.forEach(span => {{
        span.addEventListener('mouseenter', () => {{
            const key = span.dataset.entity;
            document.querySelectorAll(`[data-entity="${{key}}"]`).forEach(el => el.classList.add('hovered'));
            const m = metrics[key] || {{}};
            const grokSent = m.grok_sentiment || 'n/a';
            const wikiSent = m.wiki_sentiment || 'n/a';
            const grokSal = m.grok_salience ?? 'n/a';
            const wikiSal = m.wiki_salience ?? 'n/a';
            const cosine = m.cosine ?? 'n/a';
            metricsBox.innerHTML = `
                <div><strong>Entity:</strong> ${{key}}</div>
                <div>Grok sentiment: ${{grokSent}}, salience: ${{grokSal}}</div>
                <div>Wiki sentiment: ${{wikiSent}}, salience: ${{wikiSal}}</div>
                <div>Cosine alignment: ${{cosine}}</div>
            `;
        }});
        span.addEventListener('mouseleave', () => {{
            const key = span.dataset.entity;
            document.querySelectorAll(`[data-entity="${{key}}"]`).forEach(el => el.classList.remove('hovered'));
            metricsBox.innerHTML = "Hover an entity to see metrics...";
        }});
    }});
    </script>
    """
    components.html(component_html, height=520, scrolling=True)


def render_diff_entities(analysis: Dict[str, Any]) -> None:
    st.subheader("Diff mode: unique concepts")
    overlap = analysis.get("metrics", {}).get("entity_overlap", {}) or {}
    grok_unique = overlap.get("grok_unique", []) or []
    wiki_unique = overlap.get("wiki_unique", []) or []
    cols = st.columns(2)
    with cols[0]:
        st.markdown("**Only in Grokipedia**")
        if grok_unique:
            st.code(", ".join(grok_unique))
        else:
            st.info("None")
    with cols[1]:
        st.markdown("**Only in Wikipedia**")
        if wiki_unique:
            st.code(", ".join(wiki_unique))
        else:
            st.info("None")


def render_llm_metrics(analysis: Dict[str, Any]) -> None:
    st.subheader("LLM-judged bias metrics")
    llm_metrics = analysis.get("metrics", {}).get("llm_metrics", {}) or {}
    if not llm_metrics:
        st.info("No LLM metrics available.")
        return
    st.json(llm_metrics, expanded=False)


def sentence_diff(a_text: str, b_text: str) -> Dict[str, list]:
    splitter = re.compile(r"(?<=[.!?])\s+")
    a_sentences = [s.strip() for s in splitter.split(a_text) if s.strip()]
    b_sentences = [s.strip() for s in splitter.split(b_text) if s.strip()]
    sm = difflib.SequenceMatcher(a=a_sentences, b=b_sentences)
    ops = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        ops.append({"tag": tag, "a": a_sentences[i1:i2], "b": b_sentences[j1:j2]})
    return {"ops": ops}


def render_sentence_diff(grok_text: str, wiki_text: str) -> None:
    st.subheader("Sentence-level diff")
    diff = sentence_diff(grok_text, wiki_text)
    rows = []
    for op in diff["ops"]:
        tag = op["tag"]
        a_chunk = " ".join(op["a"])
        b_chunk = " ".join(op["b"])
        rows.append(
            {
                "op": tag,
                "grok": a_chunk,
                "wiki": b_chunk,
            }
        )
    def color_for(op: str) -> str:
        if op == "equal":
            return "#e0f7fa"
        if op == "replace":
            return "#fff4e6"
        if op == "delete":
            return "#ffe6e6"
        if op == "insert":
            return "#e6ffe6"
        return "#f5f5f5"

    for row in rows:
        st.markdown(
            f"""
            <div style="border:1px solid #ddd;border-radius:6px;padding:8px;margin-bottom:6px;">
                <div style="font-size:12px;color:#555;">op: {row['op']}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div style="background:{color_for(row['op'])};padding:6px;border-radius:4px;"><strong>Grok</strong><br>{html.escape(row['grok']) or '<i>(empty)</i>'}</div>
                    <div style="background:{color_for(row['op'])};padding:6px;border-radius:4px;"><strong>Wiki</strong><br>{html.escape(row['wiki']) or '<i>(empty)</i>'}</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )


def render_comparison_panel(comparison: Optional[Dict[str, Any]]) -> None:
    st.subheader("Comparison metrics (graph-level)")
    if not comparison:
        st.info("No comparison.json available. Run generate_graphs.py.")
        return
    ent = comparison.get("entity_overlap", {}) or {}
    edge = comparison.get("edge_overlap", {}) or {}
    col1, col2 = st.columns(2)
    with col1:
        st.markdown(
            f"**Entity overlap Jaccard:** {ent.get('jaccard', 0):.3f} | "
            f"shared: {len(ent.get('intersection', []))}"
        )
        st.caption("Unique (Grokipedia)")
        st.code(", ".join(ent.get("grok_unique", []) or []))
        st.caption("Unique (Wikipedia)")
        st.code(", ".join(ent.get("wiki_unique", []) or []))
    with col2:
        st.markdown(
            f"**Edge overlap Jaccard:** {edge.get('jaccard', 0):.3f} | "
            f"shared: {len(edge.get('intersection', []))}"
        )
        if edge.get("intersection"):
            st.caption("Shared edges (src, pred, dst)")
            st.code("\n".join([str(e) for e in edge.get("intersection", [])]))


def render_graph_stats(graphs: Optional[Dict[str, Any]]) -> None:
    st.subheader("Graph stats")
    if not graphs:
        st.info("No graphs found. Run generate_graphs.py.")
        return
    data = []
    for name, graph in graphs.items():
        stats = graph.get("stats", {})
        data.append(
            {
                "source": name,
                "nodes": stats.get("node_count", 0),
                "edges": stats.get("edge_count", 0),
            }
        )
    st.dataframe(data, hide_index=True, use_container_width=True)


def render_embeddings_map(embeddings: Optional[Dict[str, Any]]) -> None:
    st.subheader("Embedding map")
    if not embeddings:
        st.info("No embeddings found. Run generate_graphs.py.")
        return
    points = embeddings.get("points", []) or []
    if not points:
        st.info("Embedding points are empty.")
        return
    df = pd.DataFrame(
        [
            {
                "x": p.get("x"),
                "y": p.get("y"),
                "label": p.get("label"),
                "source": p.get("source"),
                "type": p.get("type"),
                "sentiment": p.get("sentiment"),
                "salience": p.get("salience"),
            }
            for p in points
        ]
    )
    chart = (
        alt.Chart(df)
        .mark_circle(size=80, opacity=0.7)
        .encode(
            x=alt.X("x:Q", title="Component 1"),
            y=alt.Y("y:Q", title="Component 2"),
            color=alt.Color("source:N"),
            shape=alt.Shape("type:N"),
            tooltip=["label:N", "source:N", "type:N", "sentiment:N", "salience:Q"],
        )
        .properties(height=360)
    )
    st.altair_chart(chart, use_container_width=True)


def render_pyvis_graph(graph: Dict[str, Any], title: str) -> None:
    try:
        from pyvis.network import Network
    except ImportError:
        st.warning("pyvis not installed")
        return
    net = Network(height="400px", width="100%", directed=True, notebook=False)
    net.barnes_hut()
    for node in graph.get("nodes", []):
        color = "#2563eb" if graph.get("meta", {}).get("source") == "grokipedia" else "#d97706"
        net.add_node(
            node.get("id"),
            label=node.get("label"),
            color=color,
            title=str(node.get("attrs", {})),
        )
    for edge in graph.get("edges", []):
        net.add_edge(edge.get("src"), edge.get("dst"), title=edge.get("label"), label=edge.get("label"))
    html_str = net.generate_html(notebook=False)
    st.markdown(f"**{title}**")
    components.html(html_str, height=420, scrolling=True)


def render_graph_views(graphs: Optional[Dict[str, Any]]) -> None:
    st.subheader("Graph views")
    if not graphs:
        st.info("No graphs to render.")
        return
    cols = st.columns(2)
    with cols[0]:
        render_pyvis_graph(graphs.get("grokipedia", {}), "Grokipedia graph")
    with cols[1]:
        render_pyvis_graph(graphs.get("wikipedia", {}), "Wikipedia graph")


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
    comparison = load_comparison(topic)
    graphs = load_graphs(topic)
    embeddings = load_embeddings(topic)
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
        render_linked_text(analysis, grok_text, wiki_text)
        render_diff_entities(analysis)
        render_llm_metrics(analysis)
        render_comparison_panel(comparison)
        render_graph_stats(graphs)
        render_graph_views(graphs)
        render_embeddings_map(embeddings)
        render_sentence_diff(grok_text, wiki_text)
    else:
        st.info("No analysis artifact found in data/artifacts/<topic>/analysis.json. Run scripts/run_extraction.py first.")

    render_metadata(metadata)


if __name__ == "__main__":
    main()
