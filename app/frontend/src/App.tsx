import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { diffLines, diffWords } from "diff";
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
  fetchRecomputeStatus,
} from "./api";
import { CompareProvider, useCompareControls } from "./CompareContext";
import { EmbeddingMap, EmbeddingPoint } from "./EmbeddingMap";
import { GraphView } from "./GraphView";
import { Heatmap } from "./Heatmap";

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

function StatusRow({
  label,
  loading,
  error,
  ok,
}: {
  label: string;
  loading: boolean;
  error?: unknown;
  ok: boolean;
}) {
  let text = "OK";
  let className = "pill success";
  if (loading) {
    text = "Loading…";
    className = "pill muted";
  } else if (error) {
    text = "Error";
    className = "pill warning";
  } else if (!ok) {
    text = "Missing";
    className = "pill warning";
  }
  return (
    <div className="status-row">
      <span>{label}</span>
      <span className={className}>{text}</span>
    </div>
  );
}

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
  showHighlights,
  onHover,
}: {
  segment: Segment;
  index: number;
  selectedName?: string;
  salienceThreshold: number;
  showHighlights: boolean;
  onHover?: (info: { label: string; detail?: string; source?: string } | null) => void;
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
    if (!showHighlights || normalized.length === 0) {
      return [text];
    }
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
            onMouseEnter={() =>
              onHover?.({
                label: ent.name || "",
                detail: `${ent.type || "entity"} • salience ${ent.salience ?? "?"} • sentiment ${ent.sentiment ?? "?"}`,
              })
            }
            onMouseLeave={() => onHover?.(null)}
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

function DiffView({ left, right }: { left: string; right: string }) {
  const blocks = useMemo(() => {
    const parts = diffLines(left || "", right || "");
    const merged: { type: "same" | "add" | "remove" | "change"; left?: string; right?: string }[] = [];
    let i = 0;
    while (i < parts.length) {
      const part = parts[i];
      if (part.added) {
        merged.push({ type: "add", right: part.value });
        i += 1;
      } else if (part.removed) {
        // if next part is added, treat as change
        const next = parts[i + 1];
        if (next && next.added) {
          merged.push({ type: "change", left: part.value, right: next.value });
          i += 2;
        } else {
          merged.push({ type: "remove", left: part.value });
          i += 1;
        }
      } else {
        merged.push({ type: "same", left: part.value, right: part.value });
        i += 1;
      }
    }
    return merged;
  }, [left, right]);

  const renderWords = (text: string, side: "left" | "right") => {
    if (!text) return null;
    const words = diffWords(side === "left" ? text : "", side === "right" ? text : text);
    return words.map((w, idx) => {
      if (w.added && side === "right") {
        return (
          <span key={idx} className="word-added">
            {w.value}
          </span>
        );
      }
      if (w.removed && side === "left") {
        return (
          <span key={idx} className="word-removed">
            {w.value}
          </span>
        );
      }
      if (!w.added && !w.removed) {
        return <span key={idx}>{w.value}</span>;
      }
      return null;
    });
  };

  return (
    <div className="diff-grid">
      {blocks.map((block, idx) => (
        <div key={idx} className={`diff-row diff-${block.type}`}>
          <div className="diff-cell">
            {block.type === "same" && block.left}
            {block.type === "remove" && <span className="word-removed">{block.left}</span>}
            {block.type === "change" && renderWords(block.left || "", "left")}
          </div>
          <div className="diff-cell">
            {block.type === "same" && block.right}
            {block.type === "add" && <span className="word-added">{block.right}</span>}
            {block.type === "change" && renderWords(block.right || "", "right")}
          </div>
        </div>
      ))}
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
  showHighlights,
  disabled,
  onHover,
}: {
  title: string;
  text?: string;
  loading?: boolean;
  segments?: Segment[];
  selectedName?: string;
  salienceThreshold: number;
  showHighlights: boolean;
  disabled?: boolean;
  onHover?: (info: { label: string; detail?: string } | null) => void;
}) {
  const paragraphs = (text || "").split(/\n\n+/).filter(Boolean);
  const hasSegments = segments && segments.length > 0;
  return (
    <div className="text-pane">
      <div className="pane-title">{title}</div>
      {loading && <div className="muted">Loading…</div>}
      {!loading && hasSegments && !disabled && (
        <div className="segment-scroll">
          {segments!.map((seg, idx) => (
            <HighlightedSegment
              key={seg.id}
              segment={seg}
              index={idx}
              selectedName={selectedName}
              salienceThreshold={salienceThreshold}
              showHighlights={showHighlights}
              onHover={onHover}
            />
          ))}
        </div>
      )}
      {!loading && (!hasSegments || disabled) && paragraphs.length === 0 && <div className="muted">No text available.</div>}
      {!loading && (!hasSegments || disabled) && paragraphs.length > 0 && (
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
  return (
    <CompareProvider>
      <CompareApp />
    </CompareProvider>
  );
}

function CompareApp() {
  const queryClient = useQueryClient();
  const { data: topics = [], isLoading: loadingTopics } = useQuery({ queryKey: ["topics"], queryFn: fetchTopics });
  const { topic, setTopic } = useTopicSelection(topics);
  const {
    searchQuery,
    setSearchQuery,
    selectedEntity,
    setSelectedEntity,
    salienceThreshold,
    setSalienceThreshold,
    showHighlights,
    setShowHighlights,
    showDiff,
    setShowDiff,
    showMergedGraph,
    setShowMergedGraph,
    isRecomputing,
    setIsRecomputing,
  } = useCompareControls();
  const [hoverInfo, setHoverInfo] = useState<{ label: string; source?: string; detail?: string } | null>(null);

  const { data: raw, isLoading: loadingRaw, error: rawError } = useQuery({
    queryKey: ["raw", topic],
    queryFn: () => fetchRaw(topic!),
    enabled: !!topic,
  });
  const { data: analysis, error: analysisError } = useQuery({
    queryKey: ["analysis", topic],
    queryFn: () => fetchAnalysis(topic!),
    enabled: !!topic,
  });
  const { data: comparison, error: comparisonError } = useQuery({
    queryKey: ["comparison", topic],
    queryFn: () => fetchComparison(topic!),
    enabled: !!topic,
  });
  const { data: graphs, error: graphsError } = useQuery({
    queryKey: ["graphs", topic],
    queryFn: () => fetchGraphs(topic!),
    enabled: !!topic,
  });
  const { data: embeddings, error: embeddingsError } = useQuery({
    queryKey: ["embeddings", topic],
    queryFn: () => fetchEmbeddings(topic!),
    enabled: !!topic,
  });
  const { data: segments, isError: segmentsMissing, error: segmentsError } = useQuery({
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
      setIsRecomputing(false);
      // Refresh derived artifacts after recompute finishes
      queryClient.invalidateQueries({ queryKey: ["analysis", topic] });
      queryClient.invalidateQueries({ queryKey: ["comparison", topic] });
      queryClient.invalidateQueries({ queryKey: ["graphs", topic] });
      queryClient.invalidateQueries({ queryKey: ["embeddings", topic] });
      queryClient.invalidateQueries({ queryKey: ["segments", topic] });
      queryClient.invalidateQueries({ queryKey: ["search", topic] });
      queryClient.invalidateQueries({ queryKey: ["recompute-status", topic] });
    },
    onError: () => setIsRecomputing(false),
    onMutate: () => setIsRecomputing(true),
  });

  const { data: recomputeStatus } = useQuery({
    queryKey: ["recompute-status", topic],
    queryFn: () => fetchRecomputeStatus(topic!),
    enabled: !!topic,
    refetchInterval: 4000,
  });
  useEffect(() => {
    if (recomputeStatus?.status === "running") {
      setIsRecomputing(true);
    } else if (recomputeStatus) {
      setIsRecomputing(false);
    }
  }, [recomputeStatus, setIsRecomputing]);

  const recomputeRunning = recompute.isPending || isRecomputing || recomputeStatus?.status === "running";
  const recomputeLabel =
    recomputeStatus?.status === "running"
      ? "Evaluating…"
      : recomputeStatus?.status === "ok"
        ? "Evaluation complete"
        : recomputeStatus?.status === "error"
          ? "Evaluation failed"
          : "Idle";

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
            disabled={!topic || recomputeRunning}
            onClick={() => recompute.mutate()}
            className="ghost"
            title="Re-evaluate: regenerate graphs, comparison, embeddings, segments"
          >
            {recomputeRunning ? "Re-evaluating…" : "Re-evaluate"}
          </button>
          <div className={`status-chip ${recomputeRunning ? "running" : recomputeStatus?.status === "error" ? "error" : "ok"}`}>
            {recomputeLabel}
          </div>
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
                  showHighlights={showHighlights}
                  disabled={showDiff}
                  onHover={(info) => setHoverInfo(info)}
                />
                <TextPane
                  title="Wikipedia"
                  text={raw?.wikipedia}
                  loading={loadingRaw}
                  segments={segments?.segments?.wikipedia as Segment[] | undefined}
                  selectedName={selectedEntity?.name}
                  salienceThreshold={salienceThreshold}
                  showHighlights={showHighlights}
                  disabled={showDiff}
                  onHover={(info) => setHoverInfo(info)}
                />
              </div>
              {hoverInfo && (
                <div className="tooltip-inline">
                  <strong>{hoverInfo.label}</strong> {hoverInfo.detail}
                </div>
              )}
            </Card>

            <Card title="Embedding map">
              <EmbeddingMap
                points={(embeddings?.points as EmbeddingPoint[]) || []}
                grokGraph={graphs?.grokipedia}
                wikiGraph={graphs?.wikipedia}
                merged={showMergedGraph}
                selectedName={selectedEntity?.name}
                onSelect={(label, source, type) => setSelectedEntity({ name: label, source, type })}
                salienceThreshold={salienceThreshold}
              />
            </Card>

            <Card title="Knowledge graph">
              <GraphView
                grokGraph={graphs?.grokipedia}
                wikiGraph={graphs?.wikipedia}
                merged={showMergedGraph}
                selectedName={selectedEntity?.name}
                onSelect={(label, source, type) => setSelectedEntity({ name: label, source, type })}
              />
            </Card>

            <Card title="Bias heatmap">
              <Heatmap analysis={analysis} />
            </Card>

            {showDiff && (
              <Card title="Diff view">
                <DiffView left={raw?.grokipedia || ""} right={raw?.wikipedia || ""} />
              </Card>
            )}
          </div>

          <div className="side-column">
            <Card title="Data status">
              <div className="status-list">
                <StatusRow label="Raw" loading={loadingRaw} error={rawError} ok={!!raw} />
                <StatusRow label="Analysis" loading={!analysis && !analysisError && !!topic} error={analysisError} ok={!!analysis} />
                <StatusRow label="Graphs" loading={!graphs && !graphsError && !!topic} error={graphsError} ok={!!graphs} />
                <StatusRow label="Comparison" loading={!comparison && !comparisonError && !!topic} error={comparisonError} ok={!!comparison} />
                <StatusRow label="Embeddings" loading={!embeddings && !embeddingsError && !!topic} error={embeddingsError} ok={!!embeddings} />
                <StatusRow label="Segments" loading={!segments && !segmentsError && !!topic} error={segmentsError} ok={!!segments} />
                <StatusRow
                  label="Recompute"
                  loading={isRecomputing || recompute.isPending}
                  error={recomputeStatus?.status === "error"}
                  ok={recomputeStatus?.status === "ok" || recomputeStatus?.status === "idle"}
                />
                {recomputeStatus?.status && (
                  <div className="muted">
                    status: {recomputeStatus.status}
                    {recomputeStatus.detail ? ` (${recomputeStatus.detail})` : ""}
                    {recomputeStatus.segments ? ` • segments: ${recomputeStatus.segments}` : ""}
                  </div>
                )}
              </div>
            </Card>

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
                <div className="switch-row">
                  <span>Show highlights</span>
                  <input type="checkbox" checked={showHighlights} onChange={(e) => setShowHighlights(e.target.checked)} />
                </div>
                <div className="switch-row">
                  <span>Show diff view</span>
                  <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} />
                </div>
                <div className="switch-row">
                  <span>Merged graph view</span>
                  <input type="checkbox" checked={showMergedGraph} onChange={(e) => setShowMergedGraph(e.target.checked)} />
                </div>
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
