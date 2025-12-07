#!/usr/bin/env python3
"""
Local Streamlit viewer for Grokipedia/Wikipedia article pairs stored in data/raw/.

Usage:
    streamlit run app/local_viewer.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional, Tuple

import streamlit as st


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_ROOT = BASE_DIR / "data" / "raw"


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


def main() -> None:
    st.set_page_config(page_title="Grokipedia vs Wikipedia Viewer", layout="wide")
    st.title("Grokipedia vs Wikipedia Viewer")
    st.caption("Local view of downloaded article pairs stored under data/raw/")

    topics = list_topics(DATA_ROOT)
    topic = render_sidebar(topics)
    if not topic:
        st.stop()

    topic_dir = DATA_ROOT / topic
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

    render_metadata(metadata)


if __name__ == "__main__":
    main()
