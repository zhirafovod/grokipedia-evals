import React, { useMemo } from "react";
import Plot from "react-plotly.js";

type Entity = {
  name: string;
  salience?: number;
  sentiment?: string;
};

type Analysis = {
  articles?: {
    grokipedia?: { entities?: Entity[] };
    wikipedia?: { entities?: Entity[] };
  };
};

export function Heatmap({ analysis }: { analysis?: Analysis }) {
  const data = useMemo(() => {
    if (!analysis?.articles) return [];

    const grokEntities = analysis.articles.grokipedia?.entities || [];
    const wikiEntities = analysis.articles.wikipedia?.entities || [];

    // Collect all unique entities
    const allEntities = new Set([...grokEntities.map(e => e.name), ...wikiEntities.map(e => e.name)]);
    const entities = Array.from(allEntities);

    // Sentiment scores: positive=1, neutral=0, negative=-1
    const sentimentToNum = (s?: string) => {
      if (s === "positive") return 1;
      if (s === "negative") return -1;
      return 0;
    };

    const grokValues = entities.map(name => {
      const ent = grokEntities.find(e => e.name === name);
      return sentimentToNum(ent?.sentiment);
    });

    const wikiValues = entities.map(name => {
      const ent = wikiEntities.find(e => e.name === name);
      return sentimentToNum(ent?.sentiment);
    });

    return [
      {
        z: [grokValues, wikiValues],
        x: entities,
        y: ["Grokipedia", "Wikipedia"],
        type: "heatmap",
        colorscale: [
          [0, "red"], // negative
          [0.5, "yellow"], // neutral
          [1, "green"], // positive
        ],
        showscale: true,
      },
    ];
  }, [analysis]);

  if (!data.length) return <div className="muted">No data for heatmap</div>;

  return (
    <div className="heatmap">
      <Plot
        data={data}
        layout={{
          title: "Entity Sentiment Heatmap",
          xaxis: { title: "Entities" },
          yaxis: { title: "Source" },
          height: 400,
        }}
        style={{ width: "100%", height: "400px" }}
      />
    </div>
  );
}