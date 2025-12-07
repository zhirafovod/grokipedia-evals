import React, { useMemo, useState } from "react";

export type EmbeddingPoint = {
  id: string;
  label: string;
  source: string;
  type?: string;
  x: number;
  y: number;
  salience?: number;
  sentiment?: number | string;
};

const SOURCE_COLORS: Record<string, string> = {
  grokipedia: "#60a5fa",
  wikipedia: "#f97316",
};

const TYPE_STROKE: Record<string, string> = {
  claim: "#a78bfa",
  entity: "#9ca3af",
  concept: "#22d3ee",
};

type Cluster = {
  id: string;
  cx: number;
  cy: number;
  radius: number;
  count: number;
};

function scalePoints(points: EmbeddingPoint[], width: number, height: number, padding = 24) {
  if (!points.length) return [];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  return points.map((p) => ({
    ...p,
    sx: ((p.x - minX) / spanX) * (width - padding * 2) + padding,
    sy: height - (((p.y - minY) / spanY) * (height - padding * 2) + padding),
  }));
}

type Graph = {
  nodes: { id: string; label: string; type: string; attrs?: { sentiment?: string; salience?: number } }[];
  edges: { src: string; dst: string; label?: string; attrs?: { confidence?: number } }[];
};

export function EmbeddingMap({
  points,
  grokGraph,
  wikiGraph,
  merged = false,
  selectedName,
  onSelect,
  salienceThreshold,
}: {
  points: EmbeddingPoint[];
  grokGraph?: Graph;
  wikiGraph?: Graph;
  merged?: boolean;
  selectedName?: string;
  onSelect: (name: string, source?: string, type?: string) => void;
  salienceThreshold: number;
}) {
  const [showGrok, setShowGrok] = useState(true);
  const [showWiki, setShowWiki] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [hovered, setHovered] = useState<{ label: string; detail?: string } | null>(null);

  const filtered = useMemo(() => {
    return points.filter((p) => {
      if (salienceThreshold > 0 && typeof p.salience === "number" && p.salience < salienceThreshold) return false;
      if (p.source === "grokipedia" && !showGrok) return false;
      if (p.source === "wikipedia" && !showWiki) return false;
      return true;
    });
  }, [points, salienceThreshold, showGrok, showWiki]);

  const scaled = useMemo(() => scalePoints(filtered, 620, 360), [filtered]);
  const pointMap = useMemo(() => {
    const map: Record<string, { sx: number; sy: number; source: string; type: string }> = {};
    scaled.forEach((p) => {
      map[p.id] = { sx: p.sx, sy: p.sy, source: p.source, type: p.type };
    });
    return map;
  }, [scaled]);

  const edgesToDraw = useMemo(() => {
    if (!merged) return [];
    const lines: { x1: number; y1: number; x2: number; y2: number; source: string }[] = [];
    const processGraph = (graph: Graph, source: string) => {
      graph.edges.forEach((edge) => {
        const srcPos = pointMap[edge.src];
        const dstPos = pointMap[edge.dst];
        if (srcPos && dstPos) {
          lines.push({
            x1: srcPos.sx,
            y1: srcPos.sy,
            x2: dstPos.sx,
            y2: dstPos.sy,
            source,
          });
        }
      });
    };
    if (grokGraph) processGraph(grokGraph, "grokipedia");
    if (wikiGraph) processGraph(wikiGraph, "wikipedia");
    return lines;
  }, [merged, grokGraph, wikiGraph, pointMap]);

  const clusters = useMemo(() => {
    const k = Math.max(2, Math.min(8, Math.round(Math.sqrt(Math.max(1, scaled.length) / 4))));
    if (scaled.length === 0) return [];
    const seeds = scaled.slice(0, k);
    let centroids = seeds.map((p, idx) => ({ id: `c${idx}`, x: p.sx, y: p.sy }));
    for (let iter = 0; iter < 6; iter++) {
      const assignments: { sx: number; sy: number; cluster: number }[] = [];
      scaled.forEach((p) => {
        let best = 0;
        let bestd = Number.POSITIVE_INFINITY;
        centroids.forEach((c, ci) => {
          const d = (p.sx - c.x) ** 2 + (p.sy - c.y) ** 2;
          if (d < bestd) {
            bestd = d;
            best = ci;
          }
        });
        assignments.push({ sx: p.sx, sy: p.sy, cluster: best });
      });
      const next: { sumx: number; sumy: number; count: number }[] = Array.from({ length: k }, () => ({
        sumx: 0,
        sumy: 0,
        count: 0,
      }));
      assignments.forEach((a) => {
        next[a.cluster].sumx += a.sx;
        next[a.cluster].sumy += a.sy;
        next[a.cluster].count += 1;
      });
      centroids = centroids.map((c, idx) => {
        const info = next[idx];
        if (info.count === 0) return c;
        return { ...c, x: info.sumx / info.count, y: info.sumy / info.count };
      });
    }
    const clusters: Cluster[] = centroids.map((c, idx) => {
      const pts = scaled.filter((p) => {
        let best = 0;
        let bestd = Number.POSITIVE_INFINITY;
        centroids.forEach((cent, ci) => {
          const d = (p.sx - cent.x) ** 2 + (p.sy - cent.y) ** 2;
          if (d < bestd) {
            bestd = d;
            best = ci;
          }
        });
        return best === idx;
      });
      if (pts.length === 0) return { id: `c${idx}`, cx: c.x, cy: c.y, radius: 0, count: 0 };
      const maxDist = Math.max(...pts.map((p) => Math.sqrt((p.sx - c.x) ** 2 + (p.sy - c.y) ** 2)));
      return { id: `c${idx}`, cx: c.x, cy: c.y, radius: maxDist + 16, count: pts.length };
    });
    return clusters;
  }, [scaled]);
  const selectedLower = selectedName?.toLowerCase();

  return (
    <div className="embedding-card">
      <div className="legend">
        <div className="legend-row">
          <label>
            <input type="checkbox" checked={showGrok} onChange={(e) => setShowGrok(e.target.checked)} /> Grokipedia
          </label>
          <span className="dot" style={{ background: SOURCE_COLORS.grokipedia }} />
        </div>
        <div className="legend-row">
          <label>
            <input type="checkbox" checked={showWiki} onChange={(e) => setShowWiki(e.target.checked)} /> Wikipedia
          </label>
          <span className="dot" style={{ background: SOURCE_COLORS.wikipedia }} />
        </div>
        <div className="legend-row">
          <label>
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Show labels
          </label>
        </div>
      </div>
      <svg className="embedding-map" viewBox="0 0 620 360" role="img" aria-label="Embedding scatterplot">
        {clusters.map((c, idx) =>
          c.count > 0 ? (
            <g key={c.id}>
              <circle
                cx={c.cx}
                cy={c.cy}
                r={c.radius}
                fill="none"
                stroke="rgba(96,165,250,0.25)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <text x={c.cx} y={c.cy - 5} textAnchor="middle" fill="#9ca3af" fontSize="11">
                Cluster {idx + 1}
              </text>
              <text x={c.cx} y={c.cy + 10} textAnchor="middle" fill="#9ca3af" fontSize="9">
                ({c.count} nodes)
              </text>
            </g>
          ) : null
        )}
        {edgesToDraw.map((edge, idx) => (
          <line
            key={`edge-${idx}`}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke={edge.source === "grokipedia" ? "#60a5fa" : "#f97316"}
            strokeWidth={1}
            opacity={0.5}
          />
        ))}
        {scaled.map((p) => {
          const isSelected = selectedLower && p.label.toLowerCase() === selectedLower;
          const fill = SOURCE_COLORS[p.source] || "#94a3b8";
          const stroke = TYPE_STROKE[p.type || ""] || "transparent";
          const size = 5 + Math.max(0, Math.min(6, (p.salience || 0) * 6));
          return (
            <g key={`${p.source}-${p.id}`} transform={`translate(${p.sx},${p.sy})`}>
              <circle
                r={size}
                fill={fill}
                stroke={stroke}
                strokeWidth={stroke !== "transparent" ? 2 : 0}
                opacity={isSelected ? 1 : 0.8}
                className="clickable"
                onClick={() => onSelect(p.label, p.source, p.type)}
                onMouseEnter={() =>
                  setHovered({
                    label: p.label,
                    detail: `${p.source}${p.type ? ` • ${p.type}` : ""} • salience ${p.salience ?? "?"} • sentiment ${p.sentiment ?? "?"}`,
                  })
                }
                onMouseLeave={() => setHovered(null)}
              >
                <title>
                  {p.label} • {p.source} {p.type ? `• ${p.type}` : ""}
                  {p.salience !== undefined ? ` • salience ${p.salience}` : ""}
                  {p.sentiment !== undefined ? ` • sentiment ${p.sentiment}` : ""}
                </title>
              </circle>
              {showLabels && (
                <text
                  x={size + 2}
                  y={3}
                  fontSize="8"
                  fill="#333"
                  pointerEvents="none"
                >
                  {p.label}
                </text>
              )}
              {isSelected && <circle r={size + 4} fill="none" stroke="#6ee7b7" strokeWidth={2} opacity={0.9} />}
            </g>
          );
        })}
      </svg>
      <div className="muted">{scaled.length} points shown</div>
      {hovered && (
        <div className="embedding-tooltip">
          <strong>{hovered.label}</strong> {hovered.detail}
        </div>
      )}
    </div>
  );
}
