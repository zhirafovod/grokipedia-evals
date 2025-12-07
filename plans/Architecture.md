# Architecture & Implementation Guide

This document provides a comprehensive walkthrough of the Grokipedia Bias Analyzer codebase, explaining frameworks, data flows, and implementation details so new contributors can quickly understand how everything works.

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Data Acquisition                                │
│   scripts/download_pair.py  ─▶  data/raw/<topic>/                       │
│   scripts/grokipedia-crawler.py                                         │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Extraction Pipeline                             │
│   scripts/run_extraction.py  ─▶  data/artifacts/<topic>/analysis.json   │
│   (xAI SDK + SentenceTransformers)                                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Graph & Embedding Generation                    │
│   scripts/generate_graphs.py  ─▶  *_graph.json, comparison.json,        │
│                                   embeddings.json                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Backend (FastAPI)                               │
│   server/main.py  ─▶  REST API serving artifacts + recompute trigger    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
┌────────────────────────────┐     ┌────────────────────────────┐
│  React Frontend (Vite)     │     │  Streamlit Prototype       │
│  app/frontend/             │     │  app/local_viewer.py       │
└────────────────────────────┘     └────────────────────────────┘
```

---

## 1. Data Acquisition Scripts

### 1.1 `scripts/download_pair.py`

**Purpose**: Fetch raw article text from Grokipedia and Wikipedia, saving to `data/raw/<topic>/`.

**Frameworks & Libraries**
- `requests` – HTTP client for fetching HTML/API responses.
- `argparse` – CLI argument parsing.

**Key Functions**

| Function | Description |
|----------|-------------|
| `fetch_html(url)` | GET request with browser-like headers; returns raw HTML. |
| `extract_grok_markdown(html)` | Parses Next.js RSC payload (`self.__next_f.push`) to extract article markdown. |
| `markdown_to_plaintext(md)` | Strips markdown syntax (headers, bold, links) to plain text. |
| `fetch_wikipedia_plaintext(title)` | Calls Wikipedia REST API (`action=query&prop=extracts&explaintext`) for clean text. |
| `slugify(name)` | Generates filesystem-safe topic slug. |

**Data Flow**
```
Grokipedia URL ─▶ fetch_html ─▶ extract_grok_markdown ─▶ markdown_to_plaintext ─▶ grokipedia.txt
Wikipedia URL  ─▶ Wikipedia API (extracts) ─────────────────────────────────────▶ wikipedia.txt
                                                                                  metadata.json
```

**Output Structure**
```
data/raw/<topic>/
├── grokipedia.txt   # or .md if --keep-markdown
├── wikipedia.txt
└── metadata.json    # URLs, timestamps, params
```

---

### 1.2 `scripts/grokipedia-crawler.py`

Standalone crawler with the same Next.js extraction logic; useful for ad-hoc single-page fetches.

---

## 2. Extraction Pipeline

### 2.1 `scripts/run_extraction.py`

**Purpose**: Use LLM (xAI Grok) to extract structured data (entities, relations, claims, sentiment) from both articles, then compute comparison metrics.

**Frameworks & Libraries**
- `xai_sdk` – Official xAI Python SDK for chat completions.
- `sentence_transformers` – Pre-trained transformer models for text embeddings.
- `dotenv` – Loads `XAI_API_KEY` from `.env`.

**Key Functions**

| Function | Description |
|----------|-------------|
| `run_llm_extract(client, model, text, source)` | Sends article to LLM with structured JSON schema prompt; returns `{entities, relations, claims, sentiment}`. |
| `compute_entity_overlap(grok, wiki)` | Jaccard similarity on canonicalized entity names. |
| `compute_entity_similarity(grok, wiki, model)` | Embeds entity names with SentenceTransformer; computes cosine similarity matrix; returns top matches. |
| `compute_sentiment_divergence(grok, wiki)` | Maps sentiment labels to scores; computes mean absolute difference on shared entities. |
| `run_llm_pair_metrics(client, model, grok_text, wiki_text)` | LLM-as-judge comparing both articles for loaded language, propaganda flags, omissions, framing contrast. |

**LLM Prompt Design**

The system prompt instructs the model to return strict JSON with caps on item counts to control cost/latency:
```
entities: up to 20 items {name, type, salience, sentiment}
relations: up to 15 items {subject, predicate, object, evidence}
claims: up to 12 items {summary, stance, evidence_snippet}
sentiment: {overall, score, notes}
```

**Output**: `data/artifacts/<topic>/analysis.json`
```json
{
  "topic": "COVID-19_lab_leak_theory",
  "model": "grok-3",
  "generated_at": "2025-12-07T...",
  "articles": {
    "grokipedia": { "entities": [...], "relations": [...], "claims": [...], "sentiment": {...} },
    "wikipedia": { ... }
  },
  "metrics": {
    "entity_overlap": { "jaccard": 0.42, "intersection": [...], ... },
    "entity_similarity": { "matches": [...], "model": "all-MiniLM-L6-v2" },
    "sentiment_divergence": { "mean_abs_diff": 0.3, "count": 12 },
    "llm_metrics": { "loaded_language": {...}, "propaganda_flags": {...}, ... }
  }
}
```

---

## 3. Graph & Embedding Generation

### 3.1 `scripts/generate_graphs.py`

**Purpose**: Transform `analysis.json` into graph structures and 2D embeddings for visualization.

**Frameworks & Libraries**
- `sentence_transformers` – Encodes entity labels.
- `sklearn.decomposition.PCA` – Reduces embeddings to 2D.
- `numpy` – Array operations.

**Key Functions**

| Function | Description |
|----------|-------------|
| `canonical(text)` | Lowercase, strip punctuation, collapse to `_`-separated slug for stable IDs. |
| `build_graph(analysis, source)` | Maps entities→nodes, relations→edges with attrs (sentiment, salience). |
| `compute_comparison(grok_graph, wiki_graph)` | Jaccard on node IDs and edge keys `(src, label, dst)`. |
| `compute_embeddings(graphs, model_name)` | Embeds all node labels; PCA to 2D; attaches `x, y` to each point. |

**Output Files**
```
data/artifacts/<topic>/
├── grokipedia_graph.json
├── wikipedia_graph.json
├── comparison.json
└── embeddings.json
```

**Graph Schema** (per `plans/Graph.md`)
```json
{
  "meta": { "topic", "source", "model", "generated_at" },
  "nodes": [{ "id", "type", "label", "source", "attrs": { "sentiment", "salience", "aliases" } }],
  "edges": [{ "id", "src", "dst", "type", "label", "source", "attrs": { "evidence_span" } }],
  "stats": { "node_count", "edge_count" }
}
```

---

## 4. Backend Server

### 4.1 `server/main.py`

**Framework**: FastAPI – modern async Python web framework with automatic OpenAPI docs.

**Why FastAPI?**
- Type hints → automatic request validation and docs.
- Async-ready for future background jobs.
- Simple middleware for CORS (required for browser fetch from Vite dev server).

**Endpoints**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/topics` | List topic slugs under `data/raw/`. |
| GET | `/api/topic/{topic}/raw` | Return `{ grokipedia, wikipedia, metadata }` texts. |
| GET | `/api/topic/{topic}/analysis` | Return `analysis.json`. |
| GET | `/api/topic/{topic}/graphs` | Return both `*_graph.json` files. |
| GET | `/api/topic/{topic}/comparison` | Return `comparison.json`. |
| GET | `/api/topic/{topic}/embeddings` | Return `embeddings.json`. |
| GET | `/api/topic/{topic}/segments` | Return `segments.json` or fallback paragraph-based segments. |
| GET | `/api/topic/{topic}/search` | Substring search over graph nodes/edges. |
| POST | `/api/topic/{topic}/recompute` | Re-run `generate_graphs.py` and refresh artifacts. |

**CORS Configuration**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only; restrict in prod
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Helper Patterns**
- `load_json(path)` raises `HTTPException(404)` if missing, `HTTPException(500)` if malformed.
- `build_fallback_segments()` splits raw text by `\n\n` when `segments.json` is absent.

**Running**
```bash
uvicorn server.main:app --reload --port 8000
```

---

## 5. Frontend (React + Vite)

### 5.1 Tech Stack

| Tool | Purpose |
|------|---------|
| **Vite** | Fast dev server with HMR; ESBuild for bundling. |
| **React 18** | Component UI library. |
| **TypeScript** | Static typing for props, API responses. |
| **@tanstack/react-query** | Data fetching, caching, and mutation hooks. |
| **Axios** | HTTP client wrapping `fetch` with interceptors. |

### 5.2 Project Structure

```
app/frontend/
├── index.html          # Vite entry HTML
├── package.json        # deps: react, react-query, axios, vite
├── tsconfig.json       # TS config
├── vite.config.ts      # Vite plugins (react)
└── src/
    ├── main.tsx        # ReactDOM.createRoot + QueryClientProvider
    ├── App.tsx         # Main component tree
    ├── api.ts          # Axios client + fetch functions
    └── styles.css      # Global CSS variables + layout
```

### 5.3 `src/api.ts` – API Client

```typescript
const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
export const client = axios.create({ baseURL: backendUrl, timeout: 20000 });

export async function fetchTopics(): Promise<string[]> { ... }
export async function fetchAnalysis(topic: string) { ... }
export async function fetchComparison(topic: string) { ... }
export async function fetchGraphs(topic: string) { ... }
export async function fetchEmbeddings(topic: string) { ... }
export async function fetchRaw(topic: string) { ... }
export async function fetchSegments(topic: string) { ... }
export async function searchTopic(topic, query, kind) { ... }
export async function triggerRecompute(topic: string) { ... }
```

### 5.4 `src/App.tsx` – Component Tree

```
<App>
  <header>
    <SelectTopic />
    <RecomputeButton />
  </header>
  <div className="layout">
    <main-column>
      <Card title="Article text">
        <TextPane title="Grokipedia" />
        <TextPane title="Wikipedia" />
      </Card>
      <Card title="Embeddings preview">
        <EmbeddingsPreview />
      </Card>
    </main-column>
    <side-column>
      <Card title="Key metrics">
        <MetricsPanel />
      </Card>
      <Card title="Overlap details" />
      <Card title="Graph stats" />
    </side-column>
  </div>
</App>
```

**React Query Usage**
```tsx
const { data: topics } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
const { data: comparison } = useQuery({
  queryKey: ["comparison", topic],
  queryFn: () => fetchComparison(topic!),
  enabled: !!topic,
});
const recompute = useMutation({
  mutationFn: () => triggerRecompute(topic!),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comparison", topic] }),
});
```

### 5.5 `src/styles.css` – Design System

**CSS Variables**
```css
:root {
  --bg: #0c1116;
  --panel: #0f1620;
  --panel-border: #1f2933;
  --accent: #6ee7b7;
  --accent-2: #60a5fa;
  --text: #e5e7eb;
  --muted: #9ca3af;
}
```

**Layout**
- `.layout` – CSS Grid with 2fr main + 1fr sidebar.
- `.split` – Two-column grid for dual text panes.
- `.card` – Rounded panel with subtle shadow.
- `.metric` – Stat box with label + large value.
- `.pill` – Small tag/badge component.

**Responsive**
```css
@media (max-width: 960px) {
  .layout { grid-template-columns: 1fr; }
  .split { grid-template-columns: 1fr; }
}
```

**Running**
```bash
cd app/frontend
npm install
npm run dev   # http://localhost:5173
```

---

## 6. Streamlit Prototype

### 6.1 `app/local_viewer.py`

**Purpose**: Quick prototype UI with richer visualizations (Graphviz, PyVis, Altair) before React parity.

**Frameworks**
- `streamlit` – Rapid Python dashboards.
- `altair` – Declarative charting (embeddings scatter).
- `pyvis` – Interactive network graphs.
- `graphviz` – Static DOT graph rendering.

**Key Sections**
1. **Topic selector** – sidebar dropdown.
2. **Side-by-side text** – `st.text_area` columns.
3. **Entity tables** – `st.dataframe` for extracted entities.
4. **Relation graphs** – Graphviz DOT for per-source and unified overlay.
5. **Linked entity highlights** – HTML component with JS hover sync.
6. **Sentence diff** – `difflib.SequenceMatcher` colored blocks.
7. **Embeddings scatter** – Altair chart with source/type encoding.
8. **PyVis network** – Interactive force-directed graph.

**Running**
```bash
streamlit run app/local_viewer.py
```

---

## 7. Data Artifacts Reference

| File | Generator | Contents |
|------|-----------|----------|
| `data/raw/<topic>/grokipedia.txt` | `download_pair.py` | Plain text article |
| `data/raw/<topic>/wikipedia.txt` | `download_pair.py` | Plain text article |
| `data/raw/<topic>/metadata.json` | `download_pair.py` | URLs, timestamps |
| `data/artifacts/<topic>/analysis.json` | `run_extraction.py` | Entities, relations, claims, metrics |
| `data/artifacts/<topic>/grokipedia_graph.json` | `generate_graphs.py` | Graph nodes/edges |
| `data/artifacts/<topic>/wikipedia_graph.json` | `generate_graphs.py` | Graph nodes/edges |
| `data/artifacts/<topic>/comparison.json` | `generate_graphs.py` | Overlap metrics |
| `data/artifacts/<topic>/embeddings.json` | `generate_graphs.py` | 2D projected points |
| `data/artifacts/<topic>/segments.json` | (planned) | Aligned text blocks |

---

## 8. Environment & Dependencies

### Python (`requirements.txt`)
```
requests>=2.31.0
streamlit>=1.41.1
xai-sdk>=1.5.0
python-dotenv>=1.0.1
sentence-transformers>=2.7.0
fastapi>=0.115.0
uvicorn>=0.30.0
pyvis>=0.3.2
```

### Node (`app/frontend/package.json`)
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.51.3",
    "axios": "^1.7.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^5.4.10"
  }
}
```

### Environment Variables (`.env`)
```
XAI_API_KEY=xai-...
```

---

## 9. Quickstart Commands

```bash
# 1. Setup Python environment
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Download an article pair
python scripts/download_pair.py \
  --grok-url https://grokipedia.com/page/COVID-19_lab_leak_theory \
  --wiki https://en.wikipedia.org/wiki/COVID-19_lab_leak_theory

# 3. Run extraction (requires XAI_API_KEY in .env)
python scripts/run_extraction.py --topic COVID-19_lab_leak_theory

# 4. Generate graphs and embeddings
python scripts/generate_graphs.py --topic COVID-19_lab_leak_theory

# 5. Start backend
uvicorn server.main:app --reload

# 6. Start React frontend (separate terminal)
cd app/frontend && npm install && npm run dev

# 7. Or use Streamlit prototype
streamlit run app/local_viewer.py
```

---

## 10. Extension Points

| Feature | Where to Add |
|---------|--------------|
| New extraction fields | `run_extraction.py` → update `SYSTEM_PROMPT` and parsing |
| Bias signal attrs | `generate_graphs.py` → populate `bias_signals` in node/edge attrs |
| UMAP projection | `generate_graphs.py` → replace PCA with `umap.UMAP` |
| Segments alignment | New `scripts/generate_segments.py` or extend `generate_graphs.py` |
| Filter endpoint | `server/main.py` → add `/api/topic/{topic}/filter` |
| Cytoscape graph | `app/frontend` → add `cytoscape-react` component |
| Embeddings scatter | `app/frontend` → add `visx` or `plotly.js` component |

---

## 11. Glossary

| Term | Definition |
|------|------------|
| **RSC Payload** | React Server Components streaming format; Grokipedia uses Next.js which embeds content in `self.__next_f.push`. |
| **Jaccard Index** | Set similarity: `|A ∩ B| / |A ∪ B|`. |
| **Salience** | Importance score (0–1) assigned by LLM to entities. |
| **Canonical ID** | Normalized lowercase slug for entity matching across sources. |
| **React Query** | Data-fetching library providing caching, refetching, and mutations. |
| **Vite** | Frontend build tool using native ESM for fast HMR. |
