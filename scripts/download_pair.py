#!/usr/bin/env python3
"""
Download a Grokipedia + Wikipedia article pair into local files.

Example:
    python scripts/download_pair.py \
        --grok-url https://grokipedia.com/page/COVID-19_lab_leak_theory \
        --wiki https://en.wikipedia.org/wiki/COVID-19_lab_leak_theory
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import html
from pathlib import Path
from typing import Dict, Optional

import requests


REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


def slugify(name: str) -> str:
    """Create a filesystem-friendly slug."""
    slug = re.sub(r"\s+", "_", name.strip())
    slug = re.sub(r"[^A-Za-z0-9_-]+", "", slug)
    if not slug:
        raise ValueError("Cannot derive a slug from empty topic")
    return slug


def fetch_html(url: str) -> str:
    response = requests.get(url, headers=REQUEST_HEADERS, timeout=30)
    response.raise_for_status()
    return response.text


def extract_grok_markdown(html: str) -> str:
    """
    Extract markdown content from Grokipedia's Next.js RSC payload.

    Adapted from scripts/grokipedia-crawler.py.
    """
    pattern = r'self\.__next_f\.push\(\[1,"(.+?)"\]\)</script>'
    matches = re.findall(pattern, html)

    if not matches:
        return ""

    markdown = ""
    for chunk in matches:
        if chunk.startswith("# ") or "\\n# " in chunk[:100]:
            markdown = chunk
            break

    if not markdown:
        return ""

    markdown = markdown.replace("\\n", "\n")
    markdown = markdown.replace("\\t", "\t")
    markdown = markdown.replace('\\"', '"')
    markdown = markdown.replace("\\'", "'")
    markdown = markdown.replace("\\\\", "\\")

    markdown = re.sub(r'!\[[^\]]*\]\([^)]*(?:\\\)[^)]*)*\)', "", markdown)
    markdown = re.sub(r"\[\]\([^)]+\)", "", markdown)
    markdown = re.sub(r"^\s*\)*\s*$", "", markdown, flags=re.MULTILINE)
    markdown = re.sub(r"\[([^\]]+)\]\(https://grokipedia\.com/[^)]*\)", r"\1", markdown)
    markdown = re.sub(r"\[([^\]]+)\]\(https?://[^)]+\)", r"\1", markdown)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)

    return markdown.strip()


def markdown_to_plaintext(markdown: str) -> str:
    """Convert markdown to plain text while keeping basic structure."""
    text = markdown
    text = html.unescape(text)
    text = re.sub(r"^(#{1,6})\s+(.+)$", r"\2", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"_([^_]+)_", r"\1", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[\]", "", text)
    return text.strip()


def normalize_text(text: str) -> str:
    """Normalize whitespace and HTML entities for downstream processing."""
    normalized = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
    normalized = html.unescape(normalized)
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"[ \t]+\n", "\n", normalized)  # strip trailing spaces
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def fetch_grokipedia_article(url: str, keep_markdown: bool) -> str:
    html = fetch_html(url)
    markdown = extract_grok_markdown(html)
    if not markdown:
        raise ValueError("Could not extract Grokipedia article content")
    if keep_markdown:
        return normalize_text(markdown)
    return normalize_text(markdown_to_plaintext(markdown))


def parse_wikipedia_title(raw: str) -> str:
    if raw.startswith("http"):
        parsed = urllib.parse.urlparse(raw)
        title = parsed.path.rsplit("/", 1)[-1]
    else:
        title = raw
    title = title.replace("_", " ").strip()
    if not title:
        raise ValueError("Wikipedia title cannot be empty")
    return title


def wikipedia_api_url(lang: str = "en") -> str:
    return f"https://{lang}.wikipedia.org/w/api.php"


def fetch_wikipedia_plaintext(title: str, lang: str = "en") -> str:
    params: Dict[str, object] = {
        "action": "query",
        "prop": "extracts",
        "format": "json",
        "formatversion": 2,
        "explaintext": 1,
        "redirects": 1,
        "titles": title,
    }
    response = requests.get(wikipedia_api_url(lang), params=params, headers=REQUEST_HEADERS, timeout=30)
    response.raise_for_status()
    data = response.json()
    pages = data.get("query", {}).get("pages", [])
    if not pages:
        raise ValueError("Unexpected Wikipedia API response shape")
    page = pages[0]
    extract = page.get("extract", "")
    if not extract:
        raise ValueError(f"Wikipedia page not found or empty: {title}")
    return normalize_text(extract)


def infer_topic_slug(grok_url: str, wiki_title: str, override: Optional[str]) -> str:
    if override:
        return slugify(override)
    parsed = urllib.parse.urlparse(grok_url)
    last_part = parsed.path.rsplit("/", 1)[-1]
    if last_part:
        return slugify(last_part)
    return slugify(wiki_title)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def save_metadata(path: Path, metadata: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Download Grokipedia and Wikipedia articles.")
    parser.add_argument("--grok-url", required=True, help="Full Grokipedia page URL")
    parser.add_argument("--wiki", required=True, help="Wikipedia title or URL")
    parser.add_argument("--topic", help="Topic slug for output folder (defaults to Grokipedia path or wiki title)")
    parser.add_argument("--out-dir", default="data/raw", help="Base output directory")
    parser.add_argument("--lang", default="en", help="Wikipedia language code (default: en)")
    parser.add_argument(
        "--keep-markdown",
        action="store_true",
        help="Keep Grokipedia markdown (default: convert to plaintext)",
    )

    args = parser.parse_args(argv)

    try:
        wiki_title = parse_wikipedia_title(args.wiki)
        topic_slug = infer_topic_slug(args.grok_url, wiki_title, args.topic)
        out_dir = Path(args.out_dir) / topic_slug

        print(f"Fetching Grokipedia: {args.grok_url}", file=sys.stderr)
        grok_content = fetch_grokipedia_article(args.grok_url, keep_markdown=args.keep_markdown)
        grok_ext = "md" if args.keep_markdown else "txt"
        grok_path = out_dir / f"grokipedia.{grok_ext}"
        write_text(grok_path, grok_content)

        wiki_url = args.wiki if args.wiki.startswith("http") else f"https://{args.lang}.wikipedia.org/wiki/{wiki_title.replace(' ', '_')}"
        print(f"Fetching Wikipedia: {wiki_url}", file=sys.stderr)
        wiki_content = fetch_wikipedia_plaintext(wiki_title, lang=args.lang)
        wiki_path = out_dir / "wikipedia.txt"
        write_text(wiki_path, wiki_content)

        metadata = {
            "topic": topic_slug,
            "grok_url": args.grok_url,
            "wiki_title": wiki_title,
            "wiki_url": wiki_url,
            "lang": args.lang,
            "files": {
                "grokipedia": str(grok_path),
                "wikipedia": str(wiki_path),
            },
        }
        save_metadata(out_dir / "metadata.json", metadata)
        print(f"Saved files under: {out_dir}", file=sys.stderr)
        return 0
    except Exception as exc:  # pragma: no cover - CLI helper
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
