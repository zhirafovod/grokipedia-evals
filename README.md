# Grokipedia Bias Analyzer

## Overview

This project explores biases in Wikipedia articles by comparing them to their counterparts in Grokipedia, an AI-driven encyclopedia designed for greater objectivity. Using generative AI, we extract semantic concepts, build knowledge graphs, and visualize clusters to detect and highlight biases, promoting more neutral knowledge representation.

## Problem Statement

Wikipedia, once trusted as a crowd-sourced encyclopedia, faces ongoing criticisms for factual inaccuracies, vulnerability to vandalism, and systemic biases—often a mild to moderate left-leaning tilt in political topics. This is supported by computational analyses showing negative sentiment toward right-of-center entities and admissions from co-founder Larry Sanger about ideological capture.

Grokipedia is an AI-driven encyclopedia aiming to debias Wikipedia or rebuild articles from scratch for greater objectivity.

### Challenges with reliable sources/consensus

Legacy media and activists often promote one-sided narratives, suppressing alternative views under labels like "misinformation" or "political correctness". Examples include transgender activism, COVID-19 origins, critical race theory, and illegal immigration, where "scientific consensus" is built on cherry-picked evidence, ignoring fundamental questions (e.g., rejecting a woman as a biological female and so unable to answer "What is a woman?" without a circular reference). These challenges make it impossible to rely on autority of consensus.

## Project Approach

This project uses generative AI to extract semantic concepts from Grokipedia articles, build knowledge graphs of related ideas, and visualize clusters across dimensions like core knowledge, potential biases, and comparisons with Wikipedia counterparts. By analyzing patterns in deceptive techniques (e.g., loaded language, omission), it aims to detect and highlight biases for more neutral knowledge representation. Use LLM-as-a-judge with a strict prompts to produce these metrics. Use LLM to label core concepts and feauters of the article. 

## Project features

- **Knowledge graph:**
  A knowledge graph for each article pair using entity-relation extraction. Visualize clusters (e.g., knowledge vs. bias nodes).

- **Evaluations:**
  Define LLM-as-a-Judge metrics, evaluate Grokipedia/Wikipedia twin pages via metrics like entity overlap or sentiment divergence. Add bias detection patterns (e.g., flag loaded terms like "conspiracy" vs. "hypothesis"). Use AI to identify propaganda techniques (e.g., omission, framing). Output: compare on these metrics, side by side.

- **Add missing concepts:**
  Make an X app, which fetches user's feed and maps to grokipedia concepts. If missing - prompts a model to add a one. 

## Concepts to Explore

- COVID-19 origins (e.g., lab leak theory, once dismissed as racist).
  - Wikipedia: https://en.wikipedia.org/wiki/COVID-19_lab_leak_theory
  - Grokipedia: https://grokipedia.com/page/COVID-19_lab_leak_theory
- Transgender activism
  - Wikipedia: https://en.wikipedia.org/wiki/Transgender
  - Grokipedia: https://grokipedia.com/page/Transgender
- Additional: Critical race theory, illegal immigration, etc.

## Datasets

Some of the following datasets can be usedful:

- Grokipedia dump: https://huggingface.co/datasets/htriedman/grokipedia-v0.1-dump
- Wikipedia monthly: Load via `dataset = load_dataset("omarkamali/wikipedia-monthly", "latest.en", split="train")`

## Visualization Ideas

- Interactive dataset maps (e.g., Nomic Atlas: https://atlas.nomic.ai/map/475c26d7-b142-4795-9887-02b6eeb18dc0/0d312be6-a3bb-4586-b6b7-53dcd0cbefa5).
- Cluster heatmaps for bias and concept comparisons.

## Related Open-Source Projects for Visualization

A list of open-source projects related for knowledge graphs, clustering, and heatmaps.

| Project | Description | Relevance | GitHub/Website | Why Use It? |
|---------|-------------|-----------|----------------|-------------|
| **Gephi** | Open-source platform for graph and network visualization/exploration. Supports dynamic layouts, filtering, and exports. | Ideal for knowledge graph clustering and bias node highlighting. | https://gephi.org/ | Free, user-friendly for non-coders; handles large graphs from your datasets. |
| **Cytoscape** | Versatile tool for visualizing complex networks, including knowledge graphs. Includes plugins for clustering algorithms. | Great for comparing Wikipedia/Grokipedia graphs; supports bias pattern analysis via node attributes. | https://cytoscape.org/ | Open-source with community plugins; integrates with RDF for semantic data. |
| **Graphviz** | Software for rendering structural diagrams from abstract graphs/networks. | Simple static viz for knowledge graphs; useful for quick heatmaps of connections. | https://graphviz.org/ | Lightweight; scriptable in Python for automation in your pipeline. |
| **Clustergrammer** | Web-based tool for interactive hierarchically clustered heatmaps. Analyzes high-dimensional data. | Perfect for your cluster visualization heatmaps; compare bias dimensions across articles. | https://maayanlab.cloud/clustergrammer/ (GitHub: https://github.com/MaayanLab/clustergrammer-py) | JS/Python libs; shareable outputs for hackathon demos. |
| **ClustVis** | Web tool for multivariate data clustering with PCA plots and heatmaps. | Visualize concept clusters (e.g., knowledge vs. bias) from embeddings. | https://biit.cs.ut.ee/clustvis/ | No-code entry point; export to integrate with your app. |
| **AI Fairness 360 (IBM)** | Toolkit for detecting/mitigating bias in ML models and text. Includes fairness metrics. | Adapt for text bias detection in Wikipedia/Grokipedia; e.g., sentiment bias scoring. | https://github.com/Trusted-AI/AIF360 | Comprehensive for your goal of identifying propaganda patterns. |
| **Wiki Neutrality Corpus (WNC)** | Parallel corpus of biased/neutralized Wikipedia text for bias studies. | Train/test bias detectors; compare with your datasets. | https://github.com/facebookresearch/fairseq (related tools) | Provides ground truth for validating your AI-driven debiasing. |
| **Nomic Atlas** | Interactive dataset mapping for high-dimensional data (e.g., embeddings). | Directly matches your "Dataset Map" idea; visualize article clusters. | https://atlas.nomic.ai/ (open-source components on GitHub) | Handles large HF datasets; great for exploring semantic concepts. |
| **Heatmaply** | R library (with Python ports) for interactive cluster heatmaps using Plotly/ggplot2. | Dynamic heatmaps for bias comparisons. | https://github.com/talgalili/heatmaply | Integrates with your Python setup; interactive for user demos. |

## Architecture

### High-Level Flow

- Ingest two target articles (Grokipedia + Wikipedia).
- Extract entities, relations, claims, and sentiment using LLM + NLP.
- Build per-article knowledge graphs and compute comparison metrics.
- Generate embeddings and cluster views for concepts and bias signals.
- Visualize side-by-side pages with interactive graphs and comparison panels.

### Core Components

- `Data Ingestion`: HTTP fetch of article content + optional cached dumps (HF datasets).
- `Extraction & Scoring`: LLM pipelines for entity/relations, claim framing, propaganda techniques, sentiment.
- `Graph Builder`: Build per-article graph structures (nodes/edges, attributes).
- `Analytics`: Embedding generation, clustering, overlap/ divergence metrics, bias scoring.
- `Web App`: Two pages (Grokipedia/Wikipedia) with synchronized views and comparison module.

### MVP

- `Static Site (no backend)`: Precompute JSON artifacts; host as static assets. Pros: simple deploy, cheap. Cons: no on-demand analysis.
- `All-in-Python Notebook`: Use Streamlit for quick UI. Pros: fastest to iterate. Cons: limited UI/graph flexibility.
- `Full-stack Next.js`: Server-side rendering + API routes; good DX. Cons: mixing Python pipelines requires extra infra.

### Further improvements

- `Frontend`: React + Vite, Tailwind CSS, D3.js (graphs) or Cytoscape.js (networks), Plotly (heatmaps), TanStack Router.
- `Backend`: Python FastAPI for pipelines; uvicorn for dev; Celery (optional) for async jobs.
- `LLM & NLP`: OpenAI/Anthropic/GitHub Models via Azure AI Foundry or direct; spaCy for NLP; sentence-transformers for embeddings.
- `Data`: SQLite for small cache; Parquet for intermediate artifacts; HuggingFace datasets for dumps.
- `Graph`: NetworkX (processing) + Cytoscape.js (rendering).
- `Eval`: LLM-as-a-Judge prompts with structured scorecards; store JSON outputs.

### Project Structure

- `app/` React front-end (Vite), renders two pages and comparison.
- `server/` FastAPI with endpoints for extraction, graphs, metrics.
- `data/` cached inputs and computed artifacts (JSON, Parquet).

## Data & Pipelines

- `Fetchers`: HTTP scrape APIs or dataset loaders (HF `grokipedia-v0.1-dump`, `wikipedia-monthly`).
- `Extractors`: LLM prompts for entities/relations, claim framing, sentiment; spaCy NER fallback.
- `Embeddings`: `sentence-transformers` for concept embeddings; UMAP/t-SNE for projection.
- `Graphs`: NetworkX to build nodes/edges with attributes: type (concept/bias/core), score (sentiment, propaganda likelihood), source (wiki/grok).
- `Metrics`: Overlap (entity Jaccard), sentiment divergence, loaded-language frequency, omission heuristics.
- `Outputs`: JSON (graphs, metrics), CSV/Parquet (tables), optional Atlas map config.

## Quickstart: Fetch one article pair

- Install Python deps: `python -m pip install -r requirements.txt`
- Download Grokipedia + Wikipedia texts into `data/raw/<topic>/`: `python scripts/download_pair.py --grok-url https://grokipedia.com/page/COVID-19_lab_leak_theory --wiki https://en.wikipedia.org/wiki/COVID-19_lab_leak_theory`
- Outputs land in `data/raw/<topic>/`: `grokipedia.txt` (or `.md` with `--keep-markdown`), `wikipedia.txt`, `metadata.json`.
- Repeat for other topics (e.g., Transgender, Critical_race_theory) to build the MVP dataset.

## Two-Page MVP

- `Page: Grokipedia`
  - Article view with extracted core concepts, graph panel (Cytoscape.js), bias signals list, download JSON.
  - Controls: prompt profile selector (strict/lenient), recompute button (if backend).

- `Page: Wikipedia`
  - Same layout for parity; visual cues for loaded language, framing, omission flags.

- `Comparison Sidebar`
  - Entity overlap, sentiment divergence, propaganda techniques tally, top-5 differences.

## Implementation Notes

- Use xAI Python SDK
- Favor deterministic prompt templates; log model name, temperature, and version.
- Keep artifacts small (<5MB) for fast load; paginate or lazy-load graph components.
- Use IDs stable across runs for entities to support comparison.
- Add minimal tests: pipeline unit tests for extractor prompts and metric calculations.

## Next Steps

- Scaffold `server` (FastAPI + requirements.txt) and `app` (Vite React).
- Implement precompute CLI for the two selected articles.
- Wire frontend to load `data/artifacts/*.json` and render graphs and metrics.

## Changelog

- 2024-12-21: Added `requirements.txt` and updated README quickstart/install instructions.
- 2024-12-20: Added `scripts/download_pair.py` to fetch Grokipedia + Wikipedia pairs and documented the quickstart command/output structure.
