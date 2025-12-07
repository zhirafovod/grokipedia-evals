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
  searchTopic,
  triggerRecompute,
} from "./api";

type GraphStats = { node_count?: number; edge_count?: number };
type Graphs = {
  grokipedia?: { stats?: GraphStats };
  wikipedia?: { stats?: GraphStats };
};

type EntitySpan = {
  name: string;
  type?: string;
  start?: number;
  end?: number;
  salience?: number;
  sentiment?: string;
};

type Segment = {
  id: string;
  source: string;
  text: string;
  start?: number;
  end?: number;
  entities?: EntitySpan[];
  metrics?: Record<string, any>;
};

type SelectedEntity = { name: string; source?: string; type?: string } | null;

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

function HighlightedSegment({
  segment,
  index,
  selectedName,
  salienceThreshold,
}: {
  segment: Segment;
  index: number;
  selectedName?: string;
  salienceThreshold: number;
}) {
  const { text = "", entities = [], start = 0 } = segment;
  const parts = useMemo(() => {
    const normalized = entities
      .filter((e) => {
        const sal = typeof e.salience === "number" ? e.salience : undefined;
        if (salienceThreshold > 0 && sal !== undefined && sal < salienceThreshold) {
          return false;
        }
        return typeof e.start === "number" && typeof e.end === "number" && (e.start ?? 0) < (e.end ?? 0);
      })
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    for (const ent of normalized) {
      const relStart = (ent.start ?? 0) - start;
      const relEnd = (ent.end ?? 0) - start;
      if (relStart > cursor) {
        nodes.push(text.slice(cursor, relStart));
      }
      if (relStart >= 0 && relStart < text.length && relEnd > relStart) {
        const slice = text.slice(relStart, Math.min(relEnd, text.length));
        nodes.push(
          <span
            key={`${segment.id}-${ent.name}-${relStart}`}
            className={`highlight${selectedName && ent.name?.toLowerCase() === selectedName.toLowerCase() ? " highlight-active" : ""}`}
            title={`${ent.name}${ent.type ? ` (${ent.type})` : ""}`}
          >
            {slice}
          </span>
        );
        cursor = Math.min(relEnd, text.length);
      }
    }
    if (cursor < text.length) {
      nodes.push(text.slice(cursor));
    }
    return nodes;
  }, [entities, segment.id, start, text]);

  const mentionCount = segment.metrics?.entity_mentions ?? entities.length;

  return (
    <div className="segment-block">
      <div className="segment-meta">
        <span>Segment {index + 1}</span>
        <span className="muted">{mentionCount} mentions</span>
      </div>
      <div className="segment-text">{parts}</div>
    </div>
  );
}

function TextPane({
  title,
  text,
  loading,
  segments,
  selectedName,
  salienceThreshold,
}: {
  title: string;
  text?: string;
  loading?: boolean;
  segments?: Segment[];
  selectedName?: string;
  salienceThreshold: number;
}) {
  const paragraphs = (text || "").split(/\n\n+/).filter(Boolean);
  const hasSegments = segments && segments.length > 0;
  return (
    <div className="text-pane">
      <div className="pane-title">{title}</div>
      {loading && <div className="muted">Loading…</div>}
      {!loading && hasSegments && (
        <div className="segment-scroll">
          {segments!.map((seg, idx) => (
            <HighlightedSegment
              key={seg.id}
              segment={seg}
              index={idx}
              selectedName={selectedName}
              salienceThreshold={salienceThreshold}
            />
          ))}
        </div>
      )}
      {!loading && !hasSegments && paragraphs.length === 0 && <div className="muted">No text available.</div>}
      {!loading && !hasSegments && paragraphs.length > 0 && (
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);
  const [salienceThreshold, setSalienceThreshold] = useState(0);

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
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ["search", topic, searchQuery],
    queryFn: () => searchTopic(topic!, searchQuery, "entity"),
    enabled: !!topic && searchQuery.trim().length > 1,
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
      queryClient.invalidateQueries({ queryKey: ["search", topic] });
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
          <SelectTopic
            topics={topics}
            selected={topic}
            onChange={(t) => {
              setSelectedEntity(null);
              setTopic(t);
            }}
          />
          <div className="search">
            <input
              type="search"
              placeholder="Search entities…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {selectedEntity && (
            <div className="pill active">
              {selectedEntity.name}
              <button className="tiny" onClick={() => setSelectedEntity(null)} title="Clear selection">
                ✕
              </button>
            </div>
          )}
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
                <TextPane
                  title="Grokipedia"
                  text={raw?.grokipedia}
                  loading={loadingRaw}
                  segments={segments?.segments?.grokipedia as Segment[] | undefined}
                  selectedName={selectedEntity?.name}
                  salienceThreshold={salienceThreshold}
                />
                <TextPane
                  title="Wikipedia"
                  text={raw?.wikipedia}
                  loading={loadingRaw}
                  segments={segments?.segments?.wikipedia as Segment[] | undefined}
                  selectedName={selectedEntity?.name}
                  salienceThreshold={salienceThreshold}
                />
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

            <Card title="Filters">
              <div className="filter">
                <label htmlFor="salience">Highlight salience ≥ {salienceThreshold.toFixed(2)}</label>
                <input
                  id="salience"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={salienceThreshold}
                  onChange={(e) => setSalienceThreshold(parseFloat(e.target.value))}
                />
              </div>
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

            <Card title="Search results">
              {!searchQuery && <div className="muted">Type 2+ chars to search entities.</div>}
              {searchQuery && searching && <div className="muted">Searching…</div>}
              {searchQuery && !searching && (
                <div className="embeddings">
                  {searchResults?.results?.length ? (
                    <ul>
                      {searchResults.results.map((r: any) => (
                        <li
                          key={`${r.source}-${r.id}`}
                          className="clickable"
                          onClick={() => setSelectedEntity({ name: r.label, source: r.source, type: r.type })}
                        >
                          <span className="pill">{r.source}</span>
                          <strong>{r.label}</strong>
                          <span className="muted">
                            ({r.type || "entity"}) · sentiment {r.sentiment ?? "n/a"} · salience {r.salience ?? "n/a"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="muted">No matches.</div>
                  )}
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
