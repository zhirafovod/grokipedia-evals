import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAnalysis,
  fetchComparison,
  fetchEmbeddings,
  fetchGraphs,
  fetchRaw,
  fetchSegments,
  fetchTopics,
  triggerRecompute,
} from "./api";

type GraphStats = { node_count?: number; edge_count?: number };
type Graphs = {
  grokipedia?: { stats?: GraphStats };
  wikipedia?: { stats?: GraphStats };
};

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
    <label className="select">
      <span>Topic</span>
      <select value={selected || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select topic</option>
        {topics.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

function Card({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="card">
      <header className="card-header">
        <h3>{title}</h3>
        {actions}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

function TextPane({ title, text, loading }: { title: string; text?: string; loading?: boolean }) {
  const paragraphs = (text || "").split(/\n\n+/).filter(Boolean);
  return (
    <div className="text-pane">
      <div className="pane-title">{title}</div>
      {loading && <div className="muted">Loading…</div>}
      {!loading && paragraphs.length === 0 && <div className="muted">No text available.</div>}
      {!loading && paragraphs.length > 0 && (
        <div className="text-scroll">
          {paragraphs.map((p, idx) => (
            <p key={idx}>{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricsPanel({
  comparison,
  graphs,
}: {
  comparison?: any;
  graphs?: Graphs;
}) {
  const entityOverlap = comparison?.entity_overlap?.jaccard;
  const edgeOverlap = comparison?.edge_overlap?.jaccard;
  const grokStats = graphs?.grokipedia?.stats;
  const wikiStats = graphs?.wikipedia?.stats;

  return (
    <div className="metrics">
      <div className="metric">
        <div className="metric-label">Entity overlap (Jaccard)</div>
        <div className="metric-value">{entityOverlap != null ? entityOverlap.toFixed(3) : "—"}</div>
      </div>
      <div className="metric">
        <div className="metric-label">Edge overlap (Jaccard)</div>
        <div className="metric-value">{edgeOverlap != null ? edgeOverlap.toFixed(3) : "—"}</div>
      </div>
      <div className="metric">
        <div className="metric-label">Grok graph</div>
        <div className="metric-sub">
          {grokStats ? `${grokStats.node_count ?? 0} nodes · ${grokStats.edge_count ?? 0} edges` : "—"}
        </div>
      </div>
      <div className="metric">
        <div className="metric-label">Wiki graph</div>
        <div className="metric-sub">
          {wikiStats ? `${wikiStats.node_count ?? 0} nodes · ${wikiStats.edge_count ?? 0} edges` : "—"}
        </div>
      </div>
    </div>
  );
}

function EmbeddingsPreview({ embeddings }: { embeddings?: any }) {
  const sample = embeddings?.points?.slice(0, 8) || [];
  return (
    <div className="embeddings">
      {sample.length === 0 && <div className="muted">No embedding points yet.</div>}
      {sample.length > 0 && (
        <ul>
          {sample.map((p: any) => (
            <li key={p.id}>
              <span className="pill">{p.source}</span>
              <strong>{p.label}</strong>
              <span className="muted">
                ({p.type || "entity"}) · sentiment {p.sentiment ?? "n/a"} · salience {p.salience ?? "n/a"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function useTopicSelection(topics: string[]) {
  const [topic, setTopic] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!topic && topics.length > 0) {
      setTopic(topics[0]);
    }
  }, [topics, topic]);
  return { topic, setTopic };
}

function App() {
  const queryClient = useQueryClient();
  const { data: topics = [], isLoading: loadingTopics } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const { topic, setTopic } = useTopicSelection(topics);

  const { data: raw, isLoading: loadingRaw } = useQuery({
    queryKey: ["raw", topic],
    queryFn: () => fetchRaw(topic!),
    enabled: !!topic,
  });
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
  const { data: segments, isError: segmentsMissing } = useQuery({
    queryKey: ["segments", topic],
    queryFn: () => fetchSegments(topic!),
    enabled: !!topic,
  });

  const recompute = useMutation({
    mutationFn: () => triggerRecompute(topic!),
    onSuccess: () => {
      // Refresh derived artifacts after recompute finishes
      queryClient.invalidateQueries({ queryKey: ["analysis", topic] });
      queryClient.invalidateQueries({ queryKey: ["comparison", topic] });
      queryClient.invalidateQueries({ queryKey: ["graphs", topic] });
      queryClient.invalidateQueries({ queryKey: ["embeddings", topic] });
      queryClient.invalidateQueries({ queryKey: ["segments", topic] });
    },
  });

  const metaLine = useMemo(() => {
    const model = analysis?.model || raw?.metadata?.model;
    const generated = analysis?.generated_at || raw?.metadata?.generated_at;
    if (!model && !generated) return "";
    return [model, generated].filter(Boolean).join(" • ");
  }, [analysis, raw]);

  const segmentCounts = {
    grok: segments?.segments?.grokipedia?.length ?? 0,
    wiki: segments?.segments?.wikipedia?.length ?? 0,
  };
  const segmentsMeta = segments?.meta;
  const segmentsFallback = segmentsMeta?.generated === "fallback";

  return (
    <div className="app">
      <header className="header">
        <div>
          <div className="eyebrow">Grokipedia vs Wikipedia</div>
          <h1>Compare topics, bias, and structure</h1>
          {metaLine && <div className="muted">{metaLine}</div>}
        </div>
        <div className="header-actions">
          <SelectTopic topics={topics} selected={topic} onChange={setTopic} />
          <button
            disabled={!topic || recompute.isPending}
            onClick={() => recompute.mutate()}
            className="ghost"
            title="Regenerate graphs, comparison, embeddings"
          >
            {recompute.isPending ? "Recomputing…" : "Recompute"}
          </button>
        </div>
      </header>

      {loadingTopics && <div className="muted">Loading topics…</div>}
      {!loadingTopics && !topic && <div className="muted">No topics found. Add data under data/raw/.</div>}

      {topic && (
        <div className="layout">
          <div className="main-column">
            <Card
              title="Article text"
              actions={
                <div className="pill-row">
                  {segmentsMissing && <span className="pill warning">segments.json missing</span>}
                  {segmentsFallback && <span className="pill warning">segments=fallback</span>}
                </div>
              }
            >
              <div className="split">
                <TextPane title="Grokipedia" text={raw?.grokipedia} loading={loadingRaw} />
                <TextPane title="Wikipedia" text={raw?.wikipedia} loading={loadingRaw} />
              </div>
            </Card>

            <Card title="Embeddings preview">
              <EmbeddingsPreview embeddings={embeddings} />
            </Card>
          </div>

          <div className="side-column">
            <Card title="Key metrics">
              <MetricsPanel comparison={comparison} graphs={graphs} />
            </Card>

            <Card title="Overlap details">
              <div className="overlap">
                <div>
                  <div className="metric-label">Grok unique entities</div>
                  <div className="metric-sub">{comparison?.entity_overlap?.grok_unique?.length ?? "—"}</div>
                </div>
                <div>
                  <div className="metric-label">Wiki unique entities</div>
                  <div className="metric-sub">{comparison?.entity_overlap?.wiki_unique?.length ?? "—"}</div>
                </div>
                <div>
                  <div className="metric-label">Shared entities</div>
                  <div className="metric-sub">{comparison?.entity_overlap?.intersection?.length ?? "—"}</div>
                </div>
              </div>
            </Card>

            <Card title="Graph stats">
              <div className="overlap">
                <div>
                  <div className="metric-label">Grok nodes/edges</div>
                  <div className="metric-sub">
                    {graphs?.grokipedia?.stats
                      ? `${graphs.grokipedia.stats.node_count ?? 0} / ${graphs.grokipedia.stats.edge_count ?? 0}`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="metric-label">Wiki nodes/edges</div>
                  <div className="metric-sub">
                    {graphs?.wikipedia?.stats
                      ? `${graphs.wikipedia.stats.node_count ?? 0} / ${graphs.wikipedia.stats.edge_count ?? 0}`
                      : "—"}
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Segments">
              <div className="overlap">
                <div>
                  <div className="metric-label">Grok segments</div>
                  <div className="metric-sub">
                    {segmentCounts.grok ?? (segmentsMissing ? "missing" : "—")}
                  </div>
                </div>
                <div>
                  <div className="metric-label">Wiki segments</div>
                  <div className="metric-sub">
                    {segmentCounts.wiki ?? (segmentsMissing ? "missing" : "—")}
                  </div>
                </div>
              </div>
              {segmentsMeta && (
                <div className="muted" style={{ marginTop: 6 }}>
                  generated: {segmentsMeta.generated || "unknown"} {segmentsFallback ? "(fallback paragraphs)" : ""}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
