# Grokipedia Bias Analyzer - Requirements & Implementation Plan

## Project Features

This document clearly defines all core features of the Grokipedia Bias Analyzer project, extracted and clarified from the original README.md. Features are prioritized and detailed for implementation.

### 1. **Knowledge Graph Generation and Visualization**
   - **Description**: For each pair of Wikipedia and Grokipedia articles (on the same topic), use generative AI (LLM) to extract semantic concepts, entities, and relations. Build a knowledge graph representing core knowledge vs. potential bias nodes.
   - **Key Capabilities**:
     - Entity-relation extraction from article texts.
     - Node clustering: Separate \"knowledge\" clusters (factual, neutral) from \"bias\" clusters (loaded language, omissions, framing).
     - Interactive visualization of graphs, highlighting differences between Wikipedia and Grokipedia.
   - **Inputs**: Article titles/URLs or texts from datasets.
   - **Outputs**: Interactive graph (e.g., using Gephi, Cytoscape, or web-based like Cytoscape.js).
   - **Dependencies**: LLM for extraction (e.g., Grok API, OpenAI), graph libraries (NetworkX, PyVis).

### 2. **Bias Detection and Evaluation Metrics (LLM-as-a-Judge)**
   - **Description**: Define and compute quantitative metrics to compare Wikipedia vs. Grokipedia articles for bias.
   - **Key Metrics**:
     | Metric | Description | Computation |
     |--------|-------------|-------------|
     | Entity Overlap | Jaccard similarity of extracted entities/concepts. | Set intersection of entities from both articles. |
     | Sentiment Divergence | Difference in sentiment scores toward key entities. | LLM scoring or VADER/TextBlob. |
     | Loaded Language Flags | Count/detect terms like \"conspiracy\" vs. \"hypothesis\". | Regex + LLM classification. |
     | Propaganda Techniques | Detect omission, framing, etc. (e.g., via AI Fairness 360 adaptations). | LLM prompts with strict judging criteria. |
     | Core Concept Coverage | % of Grokipedia concepts missing in Wikipedia (or vice versa). | LLM labeling of core concepts. |
   - **Outputs**: Side-by-side comparison table/dashboard with scores.
   - **Dependencies**: LLM API, evaluation prompts.

### 3. **Missing Concepts Discovery via X (Twitter) App**
   - **Description**: Build an interactive app that analyzes a user's X (Twitter) feed, maps mentions to Grokipedia concepts, and generates new entries if missing.
   - **Key Capabilities**:
     - Fetch user's recent tweets/posts.
     - Semantic matching: Map tweet content to existing Grokipedia pages/concepts.
     - Gap Detection: If no match, prompt LLM to draft a new neutral article stub.
     - Submit/Review workflow for adding to Grokipedia.
   - **Inputs**: User X handle or auth.
   - **Outputs**: Report of matches/misses + generated drafts.
   - **Dependencies**: X API, LLM for matching/generation, semantic search (embeddings).

### 4. **Dataset Explorer and Interactive Visualizations**
   - **Description**: Tools to explore full datasets and visualize biases at scale.
   - **Key Visualizations**:
     - Interactive dataset maps (e.g., Nomic Atlas-style embeddings of articles).
     - Cluster heatmaps for bias metrics across topics.
     - Topic-specific dashboards (e.g., COVID-19 origins, Transgender activism).
   - **Initial Topics**:
     - COVID-19 lab leak theory
     - Transgender activism
     - Critical race theory
     - Illegal immigration
   - **Dependencies**: Hugging Face datasets, viz tools (Clustergrammer, Heatmaply, Nomic).

### 5. **Core Utilities**
   - Data loading from HF datasets (Grokipedia dump, Wikipedia monthly).
   - LLM pipelines for consistent extraction/evaluation.
   - Export/shareable reports (PDF, interactive HTML).

## Non-Functional Requirements
- **Performance**: Handle 100+ article pairs efficiently; batch LLM calls.
- **Scalability**: Modular for full dataset processing.
- **Usability**: Web app or Streamlit dashboard for demos.
- **Tech Stack**: Python, Hugging Face, NetworkX, Streamlit/Gradio, LLM APIs (Grok preferred).
- **Open-Source Integration**: Leverage Gephi/Cytoscape for graphs, AI Fairness 360 for bias metrics.

## Implementation Plan - Incremental Phases

The project will be implemented in **6 incremental phases**, each delivering a working prototype. Phases build on each other, with demos at milestones. Use Agile sprints (1-2 weeks each).

### Phase 1: Setup and Data Acquisition (Foundation)
   - Load and preprocess datasets (Grokipedia dump, Wikipedia).
   - Select 5 initial article pairs (e.g., COVID-19 lab leak, Transgender).
   - Fetch full texts via APIs if needed.
   - **Deliverable**: Jupyter notebook with data explorer.
   - **Milestone**: Raw data ready for 5 pairs.

### Phase 2: Semantic Extraction and Knowledge Graphs (Core Analysis)
   - Implement LLM pipelines: Extract entities, relations, core concepts.
   - Build KGs using NetworkX.
   - Basic static viz (Graphviz).
   - **Deliverable**: KG notebooks for initial pairs.
   - **Milestone**: Graphs generated for 5 pairs.

### Phase 3: Bias Evaluations (Metrics Layer)
   - Define LLM-as-a-Judge prompts for metrics.
   - Compute and tabulate metrics (overlap, sentiment, flags).
   - Side-by-side comparison tables.
   - **Deliverable**: Evaluation dashboard (Streamlit).
   - **Milestone**: Bias scores for initial pairs.

### Phase 4: Advanced Visualizations (User-Facing)
   - Interactive KG viz (PyVis or Cytoscape.js).
   - Heatmaps and cluster maps (Clustergrammer/Plotly).
   - Dataset explorer (embeddings map).
   - **Deliverable**: Web app prototype with viz for initial topics.
   - **Milestone**: Demo-ready interactive viz.

### Phase 5: X App Integration (Dynamic Features)
   - X API integration for feed fetching.
   - Semantic matching and missing concept generator.
   - Review/submit workflow.
   - **Deliverable**: X feed analyzer module.
   - **Milestone**: End-to-end missing concept flow.

### Phase 6: Full Integration, Polish, and Scale (Production)
   - Combine all into single Streamlit/Gradio app.
   - Batch processing for full datasets.
   - Error handling, caching, API keys.
   - Documentation, tests, deployment (Hugging Face Spaces).
   - **Deliverable**: Complete hackathon-ready app.
   - **Milestone**: Live demo with 50+ topics.

## Risks and Mitigations
- **LLM Cost/Rate Limits**: Use local models (Ollama) or batching.
- **Data Access**: Fallback to cached dumps.
- **Viz Complexity**: Start simple, iterate.

This plan ensures incremental value, starting from data → analysis → viz → app.
