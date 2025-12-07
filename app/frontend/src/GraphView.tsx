import React, { useMemo, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose"; // Better layout for distribution

// Register layout
cytoscape.use(fcose);

type Node = {
  id: string;
  type: string;
  label: string;
  source: string;
  attrs?: {
    sentiment?: string;
    salience?: number;
  };
};

type Edge = {
  id: string;
  src: string;
  dst: string;
  label?: string;
  type?: string;
  attrs?: {
    confidence?: number;
  };
};

type Graph = {
  nodes: Node[];
  edges: Edge[];
};

export function GraphView({
  grokGraph,
  wikiGraph,
  merged = false,
  selectedName,
  onSelect,
}: {
  grokGraph?: Graph;
  wikiGraph?: Graph;
  merged?: boolean;
  selectedName?: string;
  onSelect: (name: string, source?: string, type?: string) => void;
}) {
  const cyRef = useRef<cytoscape.Core | null>(null);

  const elements = useMemo(() => {
    const allNodes: any[] = [];
    const allEdges: any[] = [];

    const processGraph = (graph: Graph, source: string) => {
      const nodeIds = new Set(graph.nodes.map(n => n.id));
      graph.nodes.forEach((node, idx) => {
        allNodes.push({
          data: {
            id: `${source}-${node.id}`,
            label: node.label,
            source,
            type: node.type,
            sentiment: node.attrs?.sentiment,
            salience: node.attrs?.salience,
          },
          position: { x: (idx % 10) * 150, y: Math.floor(idx / 10) * 150 }, // Initial grid positions for better layout
          classes: source,
        });
      });
      graph.edges.forEach((edge, idx) => {
        if (nodeIds.has(edge.src) && nodeIds.has(edge.dst)) {
          allEdges.push({
            data: {
              id: `${source}-edge-${idx}`,
              source: `${source}-${edge.src}`,
              target: `${source}-${edge.dst}`,
              label: edge.label || "",
              confidence: edge.attrs?.confidence,
            },
          });
        }
      });
    };

    if (grokGraph) processGraph(grokGraph, "grokipedia");
    if (wikiGraph) processGraph(wikiGraph, "wikipedia");

    return [...allNodes, ...allEdges];
  }, [grokGraph, wikiGraph]);

  const layout = useMemo(
    () => ({
      name: "fcose",
      animate: true,
      animationDuration: 1000,
      fit: true,
      padding: 30,
      nodeRepulsion: 5000,
      idealEdgeLength: 100,
      edgeElasticity: 0.1,
    }),
    []
  );

  const stylesheet = useMemo(
    () => [
      {
        selector: "node",
        style: {
          "background-color": (ele: any) => (ele.data("source") === "grokipedia" ? "#60a5fa" : "#f97316"),
          label: "data(label)",
          "text-valign": "center",
          "text-halign": "center",
          "font-size": "10px",
          width: (ele: any) => 20 + (ele.data("salience") || 0) * 20,
          height: (ele: any) => 20 + (ele.data("salience") || 0) * 20,
          shape: (ele: any) => (ele.data("type") === "entity" ? "ellipse" : "rectangle"),
        },
      },
      {
        selector: "edge",
        style: {
          width: (ele: any) => 1 + (ele.data("confidence") || 0) * 3,
          "line-color": "#ccc",
          "target-arrow-color": "#ccc",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
        },
      },
      {
        selector: ".highlighted",
        style: {
          "border-width": 3,
          "border-color": "#6ee7b7",
        },
      },
    ],
    []
  );

  const onCyReady = (cy: cytoscape.Core) => {
    cyRef.current = cy;
    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      onSelect(node.data("label"), node.data("source"), node.data("type"));
    });
  };

  // Highlight selected node
  React.useEffect(() => {
    if (!cyRef.current) return;
    cyRef.current.elements().removeClass("highlighted");
    if (selectedName) {
      cyRef.current
        .nodes()
        .filter((node) => node.data("label").toLowerCase() === selectedName.toLowerCase())
        .addClass("highlighted");
    }
  }, [selectedName]);

  return (
    <div className="graph-view">
      <CytoscapeComponent
        elements={elements}
        stylesheet={stylesheet}
        layout={layout}
        style={{ width: "100%", height: "500px" }}
        minZoom={0.1}
        maxZoom={2}
        cy={onCyReady}
      />
      <div className="muted">{elements.length} elements</div>
    </div>
  );
}