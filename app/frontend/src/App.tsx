import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchTopics,
  fetchAnalysis,
  fetchComparison,
  fetchGraphs,
  fetchEmbeddings,
  fetchRaw,
} from "./api";

function SelectTopic({
  topics,
  selected,
  onChange,
}: {
  topics: string[];
  selected?: string;
  onChange: (t: string) => void;
}) {
  return (
    <select value={selected} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select topic</option>
      {topics.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function App() {
  const { data: topics = [] } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const [topic, setTopic] = useState<string | undefined>(topics[0]);

  const { data: analysis } = useQuery({
    queryKey: ["analysis", topic],
    queryFn: () => fetchAnalysis(topic!),
    enabled: !!topic,
  });
  const { data: comparison } = useQuery({
    queryKey: ["comparison", topic],
    queryFn: () => fetchComparison(topic!),
    enabled: !!topic,
  });
  const { data: graphs } = useQuery({
    queryKey: ["graphs", topic],
    queryFn: () => fetchGraphs(topic!),
    enabled: !!topic,
  });
  const { data: embeddings } = useQuery({
    queryKey: ["embeddings", topic],
    queryFn: () => fetchEmbeddings(topic!),
    enabled: !!topic,
  });
  const { data: raw } = useQuery({
    queryKey: ["raw", topic],
    queryFn: () => fetchRaw(topic!),
    enabled: !!topic,
  });

  return (
    <div className="app">
      <header className="header">
        <h1>Grokipedia vs Wikipedia</h1>
        <SelectTopic topics={topics} selected={topic} onChange={setTopic} />
      </header>
      {!topic && <div>Please select a topic.</div>}
      {topic && (
        <div className="grid">
          <section>
            <h2>Raw text</h2>
            <div className="split">
              <textarea value={raw?.grokipedia || ""} readOnly />
              <textarea value={raw?.wikipedia || ""} readOnly />
            </div>
          </section>
          <section>
            <h2>Metrics</h2>
            <pre>{JSON.stringify(analysis?.metrics, null, 2)}</pre>
          </section>
          <section>
            <h2>Comparison</h2>
            <pre>{JSON.stringify(comparison, null, 2)}</pre>
          </section>
          <section>
            <h2>Graphs</h2>
            <pre>{JSON.stringify(graphs?.grokipedia?.stats, null, 2)}</pre>
            <pre>{JSON.stringify(graphs?.wikipedia?.stats, null, 2)}</pre>
          </section>
          <section>
            <h2>Embeddings (first 5)</h2>
            <pre>{JSON.stringify(embeddings?.points?.slice(0, 5) || [], null, 2)}</pre>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
