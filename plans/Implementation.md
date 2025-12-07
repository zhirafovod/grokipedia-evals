# Implementation Plan: Local Server + Fancy UI

This document reviews the current implementation, identifies missing gaps for a local server, and specifies a responsive, interactive UI to compare Grokipedia vs. Wikipedia pages. It concludes with iterative steps to implement the server and UI.

## Holistic Review

**Current state**
- `scripts/` provide data acquisition (`download_pair.py`, `grokipedia-crawler.py`) and extraction (`run_extraction.py`) producing `data/artifacts/<topic>/analysis.json`.
- Graph generation + embeddings: `scripts/generate_graphs.py` builds per-source graphs, comparison, and `embeddings.json` (SentenceTransformer + PCA).
- Backend: `server/main.py` (FastAPI) serves topics, raw, analysis, graphs, comparison, embeddings, segments (generated + fallback), search, and recompute.
- Segmentation: `scripts/generate_segments.py` emits `segments.json` (paragraph-level with entity spans); server serves it and falls back to paragraphs if missing.
- Frontend: `app/frontend` (React + Vite + React Query) has a compare layout shell (header, dual panes, metrics, embedding map, recompute action, segment counts, inline highlights, entity search + selection chip, salience filter/toggle); `app/local_viewer.py` (Streamlit) remains as a prototype playground.
- `plans/Graph.md` defines graph schema, metrics, and comparison outputs.

**Gaps**
- Server still lacks filter endpoints, schema validation, recompute job status, and cache controls (segments are basic fallback only).
- Graph/embedding generation is basic (no bias signal attributes, no layout hints, PCA-only projection, no size/quality validation).
- Segments lack alignment/diff metadata and bias/sentiment densities; fallback remains paragraph-only.
- UI lacks diff, Cytoscape graph view, advanced embedding map overlays, and filters/legends/sync scroll; design system is minimal (now includes inline highlights + search + selection + salience filter).
- No deterministic layout positions or visualization configs precomputed for client use.
- No asset endpoints for future static exports (PNG/SVG) or prebuilt layout snapshots.

## Local Server Design

**Goals**
- Serve topics, raw texts, analysis artifacts, graphs, and comparison metrics over REST.
- Provide recompute endpoints (optionally async) to regenerate analysis and graphs.
- Keep artifacts small (<5MB) and cache results.

**Endpoints (FastAPI)**
- `GET /api/topics` → list available topics.
- `GET /api/topic/{topic}/raw` → `{ grok_text, wiki_text, metadata }`.
- `GET /api/topic/{topic}/analysis` → load `analysis.json`.
- `GET /api/topic/{topic}/graphs` → `{ grok_graph, wiki_graph }` (`<source>_graph.json`).
- `GET /api/topic/{topic}/comparison` → `comparison.json`.
- `GET /api/topic/{topic}/segments` → aligned segments with highlights (future `segments.json`).
- `GET /api/topic/{topic}/search` → entity/claim search + filters (optionally backed by SQLite).
- `POST /api/topic/{topic}/recompute` → trigger pipeline: build graphs + comparison from `analysis.json`.
- Optional: `GET /api/jobs/{id}` → recompute status; `POST /api/topic/{topic}/recompute/async` for background jobs.
- Optional: `GET /api/topic/{topic}/embeddings` → clustered coordinates for concepts/entities.

**Pipeline integration**
- `scripts/generate_graphs.py`: reads `analysis.json`, writes `<source>_graph.json`, `comparison.json`, `embeddings.json` (already present; needs schema validation + bias/layout fields).
- Add `scripts/generate_segments.py` (or extend generator) to emit `segments.json` with aligned blocks + highlights used by the UI.
- Deterministic canonicalization and layout seed; log model metadata for reproducibility; enforce artifact size/quality checks.

## Fancy UI Requirements

A single responsive page providing side-by-side comparison with deep interactivity and beautiful visuals.

**Layout**
- Header: topic selector, model metadata, recompute button, search.
- Main: two columns (Grokipedia left, Wikipedia right) with synchronized scrolling.
- Sidebar or overlay panels: metrics, filters (bias signals), legend.
- Bottom: clustered embedding map and mini-graphs.

**Content Panels**
- Article text blocks: segmented into sections/paragraphs with entity and claim highlights.
- Entity list: searchable, clickable; filters by bias signals and sentiment ranges.
- Metrics panel: entity overlap (Jaccard), sentiment divergence, framing contrast, omission list, loaded language tally.

**Interactivity & Highlights**
- Hover on highlighted text shows tooltip with metrics: sentiment, confidence, bias signals, related claims/edges.
- Click an entity: highlights all occurrences in both pages; shows linked relations and claims.
- Diff-style view: two modes
  - Segment diff: aligns sections by entity overlap; shows add/remove/change markers.
  - Inline diff: sentence-level differences with color coding (added/removed/modified).
- Bias signal highlighting: toggle to emphasize text triggering loaded language, framing, propaganda likelihood (> threshold).
- Synchronization: when selecting an entity or section, both sides scroll to corresponding parts; matched segments outlined.

**Clustered Concept Embeddings (Dataset Map)**
- 2D projection (UMAP/t-SNE) of entity/concept embeddings per topic.
- Color coding:
  - Source: grok vs wiki (blue vs orange) in merged map.
  - Type: entity/claim/concept with shape or stroke style.
- Point tooltips: label, sentiment, salience, bias signals; click to focus corresponding text spans.
- Cluster overlays: density contours or hulls; selectable clusters highlight related content blocks.
- Filters: by sentiment range, bias threshold, relation type.
- Legends: clear palette and symbol meanings.

**Graphs**
- Network view (Cytoscape.js) for per-source graphs:
  - Node size by `salience`, color by `type`, ring indicator for `bias_signals` high.
  - Edge thickness by `confidence`, labels as short relation phrases.
  - Toggle merged view to overlay grok+wiki nodes; show overlaps via halos.
- Mini-metrics: degree distribution and centrality summaries.

**Visual Design**
- Clean, modern aesthetic (Tailwind CSS or Chakra UI): ample whitespace, legible fonts.
- Color palette: neutral backgrounds; highlight colors for sources and bias signals.
- Responsive behavior: stacks columns on mobile; maintains interactive tooltips.

**Accessibility & UX**
- Keyboard navigation for entities and sections.
- Tooltips with clear metrics explanations.
- Legends and filters with simple toggles and sliders.

## Data Contracts

- Inputs: `analysis.json` with entities, relations, claims, sentiment, salience, bias signals.
- Graphs: as in `plans/Graph.md` → `<source>_graph.json` and `comparison.json`.
- Segments: `segments.json` for aligned blocks + per-span highlights (entities, signals, sentiment).
- Embeddings: optional `embeddings.json` containing `[ { id, x, y, label, source, type, sentiment, salience, bias_signals } ]`.

## Iterative Steps

1. [x] Server scaffolding (FastAPI)
   - [x] Create `server/` with `main.py`.
   - [x] Implement endpoints: topics/raw/analysis/graphs/comparison/embeddings/segments/search + recompute (segments = fallback paragraphs).
   - [ ] Add filter endpoints; optional jobs status; schema validation + error handling hardening; upgrade segments to aligned spans.

2. [x] Graph generation
   - [x] Implement `scripts/generate_graphs.py` per `plans/Graph.md`.
   - [x] Write `<source>_graph.json`, `comparison.json`, `embeddings.json` for existing topic.
   - [ ] Add bias signal attrs, layout hints, and artifact validation; allow cached embedding reuse/offline mode.

3. [ ] UI foundation (React + Vite)
   - [x] Scaffold React/Vite + React Query fetching topics/raw/analysis/graphs/comparison/embeddings/segments (fallback).
   - [x] Build layout shell (header with topic selector + recompute, dual panes, metrics/sidebar, embeddings preview).
   - [x] Establish basic design tokens + palettes; reusable primitives (Card, Pill).
   - [x] Add inline segment highlights from `segments.json` + search box hitting backend search endpoint.
   - [x] Add entity selection from search with highlight emphasis in text panes; salience filter slider and toggle; data status panel.
   - [x] Add shared filter/selection context for highlights.
   - [ ] Compose `CompareView` with richer component wiring for diff/graphs.

4. [ ] Text highlighting & diff
   - [x] Generate `segments.json` (paragraph-level, entity spans, offsets).
   - [ ] Upgrade segments to aligned blocks with signals for diff modes.
   - [x] React `TextPane` with inline highlights, hover tooltips, and diff view (toggleable, inline word diff).
   - [ ] Diff modes: section alignment + inline sentence diff with color coding; sync scroll on selection.

5. [x] Embeddings map
   - [x] Generate embeddings (sentence-transformers + UMAP) for entities; save `embeddings.json`.
   - [x] React `EmbeddingMap` (SVG scatter) with source styling, salience filter, cluster overlays, selection linked to text; upgrade to Visx/Plotly later for richer interactions.

6. [x] Graph viz
   - [x] Cytoscape.js network view per source; merged overlay mode.
   - [ ] Legend, filters, bias signal styling, and mini-metrics.
   - [ ] Persist layout seeds/positions for stability across reloads.

7. [ ] Polishing & accessibility
   - [ ] Responsive layout and aesthetic polish.
   - [ ] Keyboard navigation, clear legends, tooltips.

8. [ ] Optional recompute pipeline
   - [x] Add simple status endpoint + UI indicator for recompute/evaluation progress.
   - [ ] Add async job handling (Celery or simple background tasks) for `recompute`.
   - [ ] Cache control and progress status endpoint (persistent).

## Recent Progress Updates
- **Completed (Dec 2025)**:
  - Upgraded visualizations: Added Cytoscape.js network graph view with node sizing/coloring by salience/type, edge thickness, merged overlay mode, and interactive selection linking.
  - Added Plotly heatmap for bias metrics (entity sentiment comparison across sources).
  - Enhanced embedding map with UMAP projection for better clustering; fixed graph data integrity issues.
  - Installed frontend dependencies (Cytoscape, Plotly, UMAP) and resolved import errors.

## Next immediate actions (Prioritized from Requirements Review)
- **Upgrade Visualizations** (Partially Complete):
  - [x] Add Cytoscape.js network view for per-source graphs with node sizing/coloring (salience/type), edge thickness, legends, and merged overlay mode for overlaps.
  - [x] Add cluster heatmaps for bias metrics (using Plotly for sentiment divergence).
  - [x] Enhance embedding map: Upgrade to UMAP/t-SNE for better clustering, add bias signal overlays/filters, and link selections to graphs.
  - [ ] Add legends, mini-metrics, and persist layout positions for graphs.
- **Enhance Bias Detection**:
  - Update LLM extraction prompt in `run_extraction.py` to detect loaded language flags (e.g., "conspiracy" vs. "hypothesis") and propaganda techniques (omission, framing).
  - Add bias signals to graph nodes/UI: Include in `analysis.json`, display in tooltips/filters, and highlight flagged spans in text panes.
  - Implement core concept coverage metric (% missing concepts between articles).
- **Add Export and Core Utilities**:
  - Add export functionality: UI buttons to download reports (JSON, PDF, interactive HTML) via backend.
  - Implement missing concepts discovery (X app): Basic script for semantic matching and LLM drafting (defer full app to Phase 5).
- **Polish and Accessibility**:
  - Wire diff/sync-scroll: Align segments for section-level diffs, add sync scrolling on entity selection.
  - Responsive layout: Ensure mobile stacks, keyboard navigation, and clear legends/tooltips.
  - Async recompute: Upgrade to background jobs (e.g., via Celery or threading) with persistent progress status.

## Minimal Tech Stack

- Backend: FastAPI, Uvicorn; Python modules for graph build and embeddings.
- Frontend: React + Vite, Tailwind CSS or Chakra UI; Cytoscape.js; Deck.gl/Visx/Plotly for maps.
- Data: JSON artifacts in `data/artifacts/<topic>/`.

## Success Criteria
- Single-page compare view loads topic data, highlights entities, shows tooltips and metrics.
- Diff view and synchronized scrolling work smoothly.
- Clustered embedding map provides clear visual clusters with interactive linking to text.
- Graph views are informative and performant for the dataset size.
- Recompute endpoint regenerates artifacts deterministically.
