# Code Walkthrough for Beginners

This guide walks you through the Grokipedia Bias Analyzer codebase step by step, explaining concepts as if you've never seen these frameworks before. For the full architecture diagram and reference tables, see [Architecture.md](./Architecture.md).

---

## Table of Contents

1. [What Does This Project Do?](#1-what-does-this-project-do)
2. [Project Structure](#2-project-structure)
3. [Python Basics You'll See](#3-python-basics-youll-see)
4. [Step 1: Downloading Articles](#4-step-1-downloading-articles)
5. [Step 2: Extracting Structured Data with AI](#5-step-2-extracting-structured-data-with-ai)
6. [Step 3: Building Graphs and Embeddings](#6-step-3-building-graphs-and-embeddings)
7. [Step 4: The Backend Server](#7-step-4-the-backend-server)
8. [Step 5: The React Frontend](#8-step-5-the-react-frontend)
9. [Step 6: The Streamlit Prototype](#9-step-6-the-streamlit-prototype)
10. [Common Patterns Explained](#10-common-patterns-explained)
11. [Debugging Tips](#11-debugging-tips)
12. [Exercises](#12-exercises)

---

## 1. What Does This Project Do?

This project compares articles from **Grokipedia** (an AI-generated encyclopedia) with **Wikipedia** to detect differences, biases, and framing. It:

1. **Downloads** both versions of an article
2. **Extracts** entities, relationships, and sentiment using AI
3. **Computes** overlap and divergence metrics
4. **Visualizes** the differences in a web UI

---

## 2. Project Structure

```
grokipedia-viz/
├── scripts/           # Python scripts for data processing
│   ├── download_pair.py      # Fetches articles from the web
│   ├── run_extraction.py     # Uses AI to extract structured data
│   └── generate_graphs.py    # Builds graph structures and embeddings
├── server/            # Backend API
│   └── main.py               # FastAPI server
├── app/
│   ├── local_viewer.py       # Streamlit prototype UI
│   └── frontend/             # React production UI
│       ├── src/
│       │   ├── App.tsx       # Main React component
│       │   ├── api.ts        # API client functions
│       │   └── styles.css    # Styling
│       └── package.json      # Node.js dependencies
├── data/
│   ├── raw/           # Downloaded article texts
│   └── artifacts/     # Processed JSON files
├── plans/             # Documentation
└── requirements.txt   # Python dependencies
```

---

## 3. Python Basics You'll See

### Imports at the Top

Every Python file starts with imports:

```python
from pathlib import Path      # Modern way to handle file paths
from typing import Dict, List # Type hints for better code clarity
import json                   # Read/write JSON files
import re                     # Regular expressions for text processing
```

### Type Hints

You'll see things like `def foo(name: str) -> Dict[str, object]:`. This means:
- `name: str` – the parameter `name` should be a string
- `-> Dict[str, object]` – the function returns a dictionary

These are optional but help editors catch bugs.

### The `if __name__ == "__main__":` Pattern

```python
def main():
    # actual code here
    pass

if __name__ == "__main__":
    main()
```

This means: "Only run `main()` if this file is executed directly, not when imported."

---

## 4. Step 1: Downloading Articles

**File:** `scripts/download_pair.py`

### What It Does

1. Fetches HTML from Grokipedia
2. Extracts the article text from Next.js format
3. Fetches Wikipedia text via their API
4. Saves both to `data/raw/<topic>/`

### Key Concept: Web Scraping

Grokipedia uses **Next.js**, a React framework. The article content isn't in normal HTML—it's embedded in JavaScript:

```html
<script>self.__next_f.push([1,"# Article Title\n\nContent here..."])</script>
```

The code uses a **regular expression** to find this:

```python
pattern = r'self\.__next_f\.push\(\[1,"(.+?)"\]\)</script>'
matches = re.findall(pattern, html)
```

**What's a regex?** A pattern language for finding text. `(.+?)` means "capture any characters."

### Key Concept: APIs vs Scraping

For Wikipedia, we use their **API** instead of scraping HTML:

```python
params = {
    "action": "query",
    "prop": "extracts",
    "explaintext": 1,  # Give us plain text, not HTML
    "titles": "COVID-19_lab_leak_theory",
}
response = requests.get("https://en.wikipedia.org/w/api.php", params=params)
```

APIs are preferred because:
- They're designed for programmatic access
- The format is stable (HTML can change anytime)
- They're faster and more reliable

### Try It Yourself

```bash
python scripts/download_pair.py \
  --grok-url https://grokipedia.com/page/Elon_Musk \
  --wiki https://en.wikipedia.org/wiki/Elon_Musk
```

Check `data/raw/Elon_Musk/` for the output files.

---

## 5. Step 2: Extracting Structured Data with AI

**File:** `scripts/run_extraction.py`

### What It Does

1. Loads the downloaded text files
2. Sends them to an AI model (xAI's Grok)
3. Receives structured data: entities, relations, claims
4. Computes comparison metrics
5. Saves everything to `analysis.json`

### Key Concept: LLM (Large Language Model)

An LLM is an AI that understands and generates text. We use it like this:

```python
from xai_sdk import Client, chat

client = Client(api_key="your-key")
response = client.chat.create(
    model="grok-3",
    messages=[
        chat.system("You are an analyst. Return JSON with entities..."),
        chat.user(f"Article:\n{article_text}"),
    ],
    response_format="json_object",  # Force JSON output
    temperature=0.2,  # Low = more deterministic
)
```

**What's `temperature`?** Controls randomness. 0 = always same answer, 1 = creative/varied.

### Key Concept: Prompt Engineering

The **system prompt** tells the AI what to do:

```python
SYSTEM_PROMPT = """You are a careful analyst. Given one article, extract:
- entities: up to 20 items {name, type, salience, sentiment}
- relations: up to 15 items {subject, predicate, object, evidence}
- claims: up to 12 items {summary, stance, evidence_snippet}
- sentiment: {overall, score, notes}
Return strict JSON only."""
```

We cap item counts to control costs (more tokens = more expensive).

### Key Concept: Embeddings

**Embeddings** convert text into numbers (vectors) that capture meaning:

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")
vectors = model.encode(["COVID-19", "coronavirus", "cat"])
# vectors[0] and vectors[1] will be similar (close in vector space)
# vectors[2] will be different (far away)
```

We use this to find which entities in Grokipedia match which in Wikipedia, even if spelled differently.

### Try It Yourself

```bash
# Make sure XAI_API_KEY is in your .env file
python scripts/run_extraction.py --topic COVID-19_lab_leak_theory
```

---

## 6. Step 3: Building Graphs and Embeddings

**File:** `scripts/generate_graphs.py`

### What It Does

1. Reads `analysis.json`
2. Converts entities → graph nodes, relations → graph edges
3. Computes overlap metrics (Jaccard similarity)
4. Projects entity embeddings to 2D for visualization
5. Saves `*_graph.json`, `comparison.json`, `embeddings.json`

### Key Concept: Knowledge Graphs

A **graph** has **nodes** (things) and **edges** (connections):

```
[COVID-19] --caused_by--> [SARS-CoV-2]
[COVID-19] --originated_in--> [Wuhan]
```

In code:
```python
nodes = [
    {"id": "covid_19", "label": "COVID-19", "type": "entity"},
    {"id": "sars_cov_2", "label": "SARS-CoV-2", "type": "entity"},
]
edges = [
    {"src": "covid_19", "dst": "sars_cov_2", "label": "caused_by"},
]
```

### Key Concept: Jaccard Similarity

Measures overlap between two sets:

```
Jaccard = |A ∩ B| / |A ∪ B|

Example:
  Grokipedia entities: {COVID-19, Wuhan, WHO}
  Wikipedia entities:  {COVID-19, WHO, CDC}
  
  Intersection: {COVID-19, WHO} → 2 items
  Union: {COVID-19, Wuhan, WHO, CDC} → 4 items
  Jaccard = 2/4 = 0.5
```

### Key Concept: Dimensionality Reduction (PCA)

Embeddings have hundreds of dimensions. To visualize on a 2D screen, we use **PCA**:

```python
from sklearn.decomposition import PCA

# 384-dimensional vectors → 2D points
pca = PCA(n_components=2)
coords_2d = pca.fit_transform(high_dim_vectors)
```

Now each entity has an `(x, y)` position for plotting.

### Try It Yourself

```bash
python scripts/generate_graphs.py --topic COVID-19_lab_leak_theory
```

---

## 7. Step 4: The Backend Server

**File:** `server/main.py`

### What It Does

Provides a **REST API** so the frontend can fetch data without touching files directly.

### Key Concept: What's an API?

An **API** (Application Programming Interface) lets programs talk to each other. A **REST API** uses HTTP:

```
GET /api/topics          → ["COVID-19_lab_leak_theory", "Elon_Musk"]
GET /api/topic/COVID-19_lab_leak_theory/analysis  → {entities: [...], ...}
POST /api/topic/COVID-19_lab_leak_theory/recompute → {status: "ok"}
```

### Key Concept: FastAPI Framework

**FastAPI** is a modern Python web framework. Here's the pattern:

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/api/topics")
def list_topics():
    # This function runs when someone visits GET /api/topics
    return ["topic1", "topic2"]

@app.get("/api/topic/{topic}/analysis")
def get_analysis(topic: str):
    # {topic} is a URL parameter, passed as argument
    path = Path(f"data/artifacts/{topic}/analysis.json")
    return json.loads(path.read_text())
```

The `@app.get(...)` is a **decorator**—it registers the function as a route handler.

### Key Concept: CORS

**CORS** (Cross-Origin Resource Sharing) is a browser security feature. By default, a webpage at `localhost:5173` can't fetch from `localhost:8000`. We enable it:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow any origin (dev only!)
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Try It Yourself

```bash
# Start the server
uvicorn server.main:app --reload

# In another terminal, test it
curl http://localhost:8000/api/topics
```

Visit http://localhost:8000/docs for interactive API documentation (auto-generated by FastAPI!).

---

## 8. Step 5: The React Frontend

**Directory:** `app/frontend/`

### What It Does

A modern web UI that fetches data from the backend and displays interactive comparisons.

### Key Concept: React Components

React builds UIs from **components**—reusable pieces:

```tsx
// A simple component
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>;
}

// Using it
<Greeting name="World" />
```

Components can contain other components:
```tsx
function App() {
  return (
    <div>
      <Header />
      <MainContent />
      <Footer />
    </div>
  );
}
```

### Key Concept: JSX

That HTML-like syntax in JavaScript is **JSX**. It compiles to function calls:

```tsx
// You write:
<div className="card">Hello</div>

// Compiles to:
React.createElement("div", { className: "card" }, "Hello")
```

Note: It's `className` not `class` (because `class` is reserved in JS).

### Key Concept: Hooks (useState, useEffect)

**Hooks** let components have state and side effects:

```tsx
function Counter() {
  // useState: remember a value between renders
  const [count, setCount] = useState(0);
  
  // useEffect: run code when component mounts or deps change
  useEffect(() => {
    document.title = `Count: ${count}`;
  }, [count]); // Re-run when count changes
  
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

### Key Concept: React Query

**React Query** handles data fetching elegantly:

```tsx
import { useQuery, useMutation } from "@tanstack/react-query";

function TopicView({ topic }: { topic: string }) {
  // Fetch data (auto-caches, refetches on focus, handles loading/error)
  const { data, isLoading, error } = useQuery({
    queryKey: ["analysis", topic],
    queryFn: () => fetchAnalysis(topic),
  });
  
  // Mutate data (for POST/PUT/DELETE)
  const recompute = useMutation({
    mutationFn: () => triggerRecompute(topic),
    onSuccess: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: ["analysis", topic] });
    },
  });
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error!</div>;
  return <div>{JSON.stringify(data)}</div>;
}
```

### Key Concept: Vite

**Vite** is a build tool that:
- Serves files during development with **hot reload** (changes appear instantly)
- Bundles everything for production

```bash
npm run dev    # Development server at localhost:5173
npm run build  # Create optimized production bundle
```

### Try It Yourself

```bash
cd app/frontend
npm install
npm run dev
```

Open http://localhost:5173 (make sure the backend is running too!).

---

## 9. Step 6: The Streamlit Prototype

**File:** `app/local_viewer.py`

### What It Does

A quick prototype UI built entirely in Python—good for experimentation.

### Key Concept: Streamlit

**Streamlit** turns Python scripts into web apps:

```python
import streamlit as st

st.title("My App")
name = st.text_input("Your name")
if st.button("Greet"):
    st.write(f"Hello, {name}!")
```

Run with `streamlit run app.py` and it creates a web UI automatically.

### Key Patterns in Our Code

```python
# Sidebar for navigation
topic = st.sidebar.selectbox("Select topic", topics)

# Columns for side-by-side layout
col1, col2 = st.columns(2)
with col1:
    st.markdown("**Grokipedia**")
    st.text_area("content", grok_text)
with col2:
    st.markdown("**Wikipedia**")
    st.text_area("content", wiki_text)

# Render a graph
st.graphviz_chart(dot_string)

# Render an interactive chart
st.altair_chart(chart)
```

### Try It Yourself

```bash
streamlit run app/local_viewer.py
```

---

## 10. Common Patterns Explained

### Pattern: Canonical IDs

To match entities across sources, we normalize names:

```python
def canonical(text: str) -> str:
    # "COVID-19" and "Covid 19" both become "covid_19"
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")
```

### Pattern: Path Handling with `pathlib`

Modern Python uses `Path` instead of string concatenation:

```python
from pathlib import Path

# Old way
path = os.path.join("data", "raw", topic, "analysis.json")

# New way
path = Path("data") / "raw" / topic / "analysis.json"
path.read_text()  # Read file
path.write_text(content)  # Write file
path.exists()  # Check if exists
path.mkdir(parents=True, exist_ok=True)  # Create directories
```

### Pattern: Error Handling in APIs

FastAPI uses exceptions for HTTP errors:

```python
from fastapi import HTTPException

def get_analysis(topic: str):
    path = Path(f"data/artifacts/{topic}/analysis.json")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Topic not found")
    return json.loads(path.read_text())
```

### Pattern: Environment Variables

Secrets (API keys) go in `.env`, not in code:

```bash
# .env file
XAI_API_KEY=xai-abc123...
```

```python
from dotenv import load_dotenv
import os

load_dotenv()  # Load .env file
api_key = os.environ.get("XAI_API_KEY")
```

---

## 11. Debugging Tips

### Python: Print Statements

```python
print(f"DEBUG: variable = {variable}")
print(f"DEBUG: type = {type(variable)}")
```

### Python: Breakpoints

```python
breakpoint()  # Drops into interactive debugger (pdb)
```

### React: Console Logging

```tsx
console.log("data:", data);
console.log("typeof data:", typeof data);
```

### React: React DevTools

Install the browser extension to inspect component state.

### Network: Browser DevTools

Press F12 → Network tab to see API requests/responses.

### FastAPI: Interactive Docs

Visit `/docs` for a UI to test endpoints directly.

---

## 12. Exercises

### Exercise 1: Add a New Metric

Add a "word count" metric to the extraction:

1. In `run_extraction.py`, compute word counts for both articles
2. Add to the `metrics` dict in the output
3. Display in the UI

### Exercise 2: New API Endpoint

Add `GET /api/topic/{topic}/summary` that returns just the entity counts:

1. In `server/main.py`, add a new route
2. Load analysis.json and return `{grok_entities: N, wiki_entities: M}`

### Exercise 3: UI Enhancement

Add a search box to filter entities in the React UI:

1. In `App.tsx`, add a `useState` for search term
2. Filter the entities list before rendering
3. Add an `<input>` that updates the state

### Exercise 4: New Visualization

Add a bar chart comparing entity counts:

1. In `local_viewer.py`, use `st.bar_chart()` or Altair
2. Show Grokipedia vs Wikipedia entity counts by type

---

## Next Steps

1. Read through [Architecture.md](./Architecture.md) for the complete reference
2. Run each script manually to see the outputs
3. Try the exercises above
4. Check [Implementation.md](./Implementation.md) for planned features you could help build

Happy coding! 🚀
