# Graph Builder

This document specifies the per-article graph structures (nodes/edges/attributes), data formats, and minimal APIs to build, compare, and visualize knowledge graphs for Grokipedia vs. Wikipedia pages.

## Objectives
- Represent extracted entities, claims, and relations as typed nodes and edges.
- Attach bias-relevant attributes (sentiment, framing, propaganda likelihood) for analytics.
- Enable side-by-side graphs with overlap/difference computation.
- Keep artifacts small and deterministic for static UI consumption.

## Scope
- Single-article graph schema (Grokipedia or Wikipedia).
- Pairwise comparison helpers (overlap, divergence) producing compact JSON.
- Integration points for extraction outputs (`data/artifacts/<topic>/analysis.json`).
- Visualization-ready layout hints for Cytoscape.js / D3.

## Data Model

### Node
- `id`: stable string (e.g., slugged canonical name or hashed surface form).
- `type`: `entity` | `claim` | `concept` | `source` | `topic`.
- `label`: short display string.
- `source`: `grok` | `wiki` (for per-article graphs this can be fixed; retain for later merging).
- `attrs`:
  - `sentiment`: float in [-1, 1] (LLM score or NLP).
  - `salience`: float in [0, 1] (importance/centrality proxy from extractor).
  - `bias_signals`: { `loaded_language`: float, `omission`: float, `framing`: float, `propaganda`: float } (0–1).
  - `categories`: list of strings (e.g., domain tags: virology, politics).
  - `aliases`: list of strings (surface forms).

### Edge
- `id`: stable string (concat of endpoints + relation type).
- `src`: node id.
- `dst`: node id.
- `type`: `relation` | `support` | `contradict` | `reference`.
- `label`: short relation phrase (e.g., `causes`, `associated_with`, `criticized_by`).
- `source`: `grok` | `wiki`.
- `attrs`:
  - `confidence`: float in [0, 1].
  - `evidence_span`: optional text span or offsets.
  - `bias_signals`: same shape as node.

### Graph
- `meta`: { `topic`: string, `source`: `grok` | `wiki`, `model`: string, `timestamp`: ISO }.
- `nodes`: Node[]
- `edges`: Edge[]
- `stats` (optional): { `node_count`, `edge_count`, `avg_degree`, `density`, `sentiment_mean`, `bias_signal_means` }.
- `layout` (optional): { `alg`: `force` | `cose` | `grid`, `seed`: int, `positions`: { id -> { x, y } } }.

## File Formats

- Per-article graph: `data/artifacts/<topic>/<source>_graph.json`
- Combined pair overview (computed): `data/artifacts/<topic>/comparison.json`

All files JSON, UTF-8, max size target <5MB.

## Minimal APIs (Python)

Assuming upstream extractor populates `analysis.json` with entities, relations, claims, and metrics.

- `build_graph(analysis: dict, source: Literal['grok','wiki']) -> Graph`
  - Maps entities/claims/relations to nodes/edges.
  - Normalizes ids via canonicalizer (lowercase, strip punctuation, map aliases).
- `compute_stats(graph: Graph) -> dict`
- `save_graph(graph: Graph, path: str) -> None`
- `load_graph(path: str) -> Graph`
- `compare_graphs(grok: Graph, wiki: Graph) -> dict`
  - `entity_overlap`: Jaccard on canonical ids.
  - `edge_overlap`: relation template + endpoints match rate.
  - `sentiment_divergence`: mean absolute difference on matched entities.
  - `bias_signal_diff`: per-signal deltas and top-5 largest divergences.
- `to_cytoscape(graph: Graph) -> { elements: nodes+edges, style_hints }`

## ID Canonicalization

- `canonical(name: str)`: lower, trim, replace spaces with `_`, remove brackets/quotes, collapse punctuation.
- Maintain `aliases` for matching across sources.
- If extractor provides `wikidata_id` or `page_url`, prefer those as primary ids; fall back to canonical name.

## Layout Hints for Viz

- Node color by `source`: grok (blue), wiki (orange) in merged views; single-source uses semantic coloring by `type`.
- Node size by `salience`.
- Edge thickness by `confidence`.
- Optional badge or ring to indicate high `bias_signals` (>0.7).

## Algorithms & Metrics

- **Entity Overlap (Jaccard)**: |E_grok ∩ E_wiki| / |E_grok ∪ E_wiki|
- **Edge Overlap**: normalized by relation label + canonical endpoints; fuzzy if aliases match.
- **Sentiment Divergence**: average |s_grok(entity) - s_wiki(entity)| over intersection.
- **Loaded Language Frequency**: count of flagged terms per 1k tokens in surrounding evidence spans.
- **Omission Heuristic**: entities present in one source with salience > threshold and absent in other; list top-K.
- **Framing Contrast**: claims with opposite `type` (`support` vs `contradict`) between sources.
- **Centrality**: degree, betweenness (optional, computed client-side if needed).

## Pipeline Steps

1. Read `data/artifacts/<topic>/analysis.json` for each source.
2. Build per-source graph via `build_graph` (nodes/edges/attrs).
3. Compute stats; save to `<source>_graph.json`.
4. Load both graphs; run `compare_graphs`; save `comparison.json`.
5. UI loads graphs + comparison to render Cytoscape and metrics panels.

## Determinism & IDs

- Use deterministic `seed` for layouts when precomputing positions.
- Ensure `id` generation is pure function of canonical names + relation labels.
- Log `model`, `temperature`, `version` for reproducibility.

## Validation

- Schema check: ensure required node/edge fields present.
- Size check: cap nodes/edges or prune low-confidence items if >5MB.
- Basic metrics sanity: non-negative counts, signals in [0,1].

## Open Questions / Future Work

- Introduce `claim` nodes explicitly for fine-grained framing analysis.
- Add `evidence_doc_id` and offsets for precise auditability.
- Explore RDF export for interoperability (optional).
- Add per-edge sentiment and stance classification.
