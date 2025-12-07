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

export function EmbeddingMap({
  points,
  selectedName,
  onSelect,
  salienceThreshold,
}: {
  points: EmbeddingPoint[];
  selectedName?: string;
  onSelect: (name: string, source?: string, type?: string) => void;
  salienceThreshold: number;
}) {
  const [showGrok, setShowGrok] = useState(true);
  const [showWiki, setShowWiki] = useState(true);

  const filtered = useMemo(() => {
    return points.filter((p) => {
      if (salienceThreshold > 0 && typeof p.salience === "number" && p.salience < salienceThreshold) return false;
      if (p.source === "grokipedia" && !showGrok) return false;
      if (p.source === "wikipedia" && !showWiki) return false;
      return true;
    });
  }, [points, salienceThreshold, showGrok, showWiki]);

  const scaled = useMemo(() => scalePoints(filtered, 620, 360), [filtered]);
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
      </div>
      <svg className="embedding-map" viewBox="0 0 620 360" role="img" aria-label="Embedding scatterplot">
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
              >
                <title>
                  {p.label} • {p.source} {p.type ? `• ${p.type}` : ""}
                  {p.salience !== undefined ? ` • salience ${p.salience}` : ""}
                  {p.sentiment !== undefined ? ` • sentiment ${p.sentiment}` : ""}
                </title>
              </circle>
              {isSelected && <circle r={size + 4} fill="none" stroke="#6ee7b7" strokeWidth={2} opacity={0.9} />}
            </g>
          );
        })}
      </svg>
      <div className="muted">{scaled.length} points shown</div>
    </div>
  );
}
