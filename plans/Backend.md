# Backend Plan

This plan defines the backend architecture to support the Fancy UI when local filesystem JSONs are insufficient, including APIs, storage, services, and pipelines. It complements `plans/Implementation.md` and `plans/Graph.md`.

## Objectives
- Serve topics, texts, analysis, graphs, comparison, embeddings via stable APIs.
- Enable recompute jobs and incremental updates without blocking the UI.
- Provide indexing, search, and alignment services beyond raw file reads.
- Keep artifacts deterministic, small, and cacheable.

## Architecture Overview
- **Framework**: FastAPI + Uvicorn
- **Modules**:
  - `ingestion`: filesystem loaders for raw and artifacts
  - `graphs`: build per-source graphs and comparison
  - `embeddings`: generate concept embeddings and 2D projections
  - `diff`: alignment and diff services for text segments
  - `search`: entity/concept search and filters
  - `jobs`: background recomputation (simple thread or Celery optional)
- **Storage**:
  - Filesystem JSON in `data/artifacts/<topic>/` (source of truth)
  - Optional SQLite for indices (entities, segments) and job tracking

## Data Contracts
- Inputs: `analysis.json` with entities, relations, claims, sentiment, salience, bias signals.
- Outputs:
  - `<source>_graph.json` (per `plans/Graph.md`)
  - `comparison.json` (overlaps, divergences, omissions)
  - `embeddings.json` (2D projection + attributes)
  - `segments.json` (aligned text blocks with entity/metric annotations)

## API Endpoints

### Topics & Metadata
- `GET /api/topics`
  - Returns: `[ { topic, title, updated_at } ]`
- `GET /api/topic/{topic}/meta`
  - Returns: `{ model, temperature, version, artifact_stats }`

### Raw & Analysis
- `GET /api/topic/{topic}/raw`
  - Returns: `{ grok_text, wiki_text, metadata }`
- `GET /api/topic/{topic}/analysis`
  - Returns: parsed `analysis.json`

### Graphs & Comparison
- `GET /api/topic/{topic}/graphs`
  - Returns: `{ grok_graph, wiki_graph }`
- `GET /api/topic/{topic}/comparison`
  - Returns: `comparison.json`

### Embeddings & Segments
- `GET /api/topic/{topic}/embeddings`
  - Returns: `embeddings.json` (array of `{ id, x, y, label, source, type, sentiment, salience, bias_signals }`)
- `GET /api/topic/{topic}/segments`
  - Returns: `segments.json` (aligned blocks with `{ id, source, text, entities[], metrics{} }`)

### Search & Filters
- `GET /api/topic/{topic}/search?query=...&type=entity|claim&source=grok|wiki`
  - Returns: matched nodes/entities with locations in text
- `GET /api/topic/{topic}/filter?sentiment_min=...&bias_loaded_min=...`
  - Returns: filtered node/edge ids for client highlighting

### Jobs (Recompute)
- `POST /api/topic/{topic}/recompute`
  - Body: `{ steps: ['graphs','comparison','embeddings','segments'] }`
  - Returns: `{ job_id }`
- `GET /api/jobs/{job_id}`
  - Returns: `{ status, progress, logs }`

## Storage Schema (SQLite Optional)
- `entities` (`id`, `topic`, `label`, `source`, `type`, `sentiment`, `salience`, `bias_loaded`, `bias_omission`, `bias_framing`, `aliases_json`)
- `edges` (`id`, `topic`, `src`, `dst`, `label`, `source`, `confidence`, `bias_loaded`, `bias_omission`, `bias_framing`)
- `segments` (`id`, `topic`, `source`, `start`, `end`, `text`, `entities_json`, `metrics_json`)
- `jobs` (`id`, `topic`, `status`, `steps_json`, `progress`, `started_at`, `finished_at`, `logs`)

Note: DB is optional; start with filesystem and add DB if filtering/search performance requires it.

## Services & Pipelines

### Graph Builder
- Read `analysis.json`, map entities/claims/relations to nodes/edges
- Canonicalize ids; compute stats; save `<source>_graph.json`
- Compare graphs; save `comparison.json`

### Embeddings
- Compute embeddings for entities/concepts (sentence-transformers)
- Project to 2D (UMAP/t-SNE); save `embeddings.json`

### Segmentation & Diff
- Segment texts (sections/paragraphs)
- Align segments via entity overlap and lexical similarity
- Compute per-segment metrics (sentiment mean, bias signal density)
- Save `segments.json`

### Search/Filter
- Index entities and segments (SQLite or in-memory caches)
- Provide query-based filtering by sentiment, bias, type, source

### Jobs
- Simple background worker using `concurrent.futures.ThreadPoolExecutor`
- Optionally upgrade to Celery for scale

## Error Handling & Determinism
- Validate schemas; enforce ranges [0,1] for signals
- Deterministic id and layout seeds; consistent projections for reproducibility
- Size checks: prune low-confidence items to keep artifacts <5MB

## Security & CORS
- Local dev: enable CORS for `http://localhost:5173` (Vite)
- No external auth required for local usage; add token-based auth if exposing

## Implementation Steps
1. Scaffold `server/` (FastAPI) with routers for topics/raw/analysis/graphs/comparison/embeddings/segments/search/filter/jobs.
2. Implement `scripts/generate_graphs.py` and `scripts/generate_embeddings.py`.
3. Add segmentation/diff module `server/services/segments.py`.
4. Optional: add SQLite indexing and `jobs` tracking.
5. Wire frontend to these endpoints and iterate on performance.

## Success Criteria
- UI can query topics, load artifacts, and interactively filter/highlight.
- Recompute jobs regenerate artifacts deterministically.
- Search and alignment are responsive for current dataset sizes.
