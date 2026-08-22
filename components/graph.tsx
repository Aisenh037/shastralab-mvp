import { STATUS_COLOR } from "./ui";

interface GraphConcept {
  id: string;
  name: string;
  graphX: number;
  graphY: number;
}
interface GraphEdge {
  fromId: string;
  toId: string;
  type: string;
}
interface GraphState {
  conceptId: string;
  mastery: number;
  status: string;
}

/**
 * The knowledge graph, rendered as hand-positioned SVG (no graph library):
 * 7 nodes, status-colored, CSS-transitioned. `highlightPath` lights up the
 * bottleneck traversal after each turn - the visual for the root-cause reveal.
 */
export function KnowledgeGraph({
  concepts,
  edges,
  states,
  highlightPath = [],
  bottleneckId,
}: {
  concepts: GraphConcept[];
  edges: GraphEdge[];
  states: GraphState[];
  highlightPath?: string[];
  bottleneckId?: string | null;
}) {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const stateById = new Map(states.map((s) => [s.conceptId, s]));
  const onPath = (a: string, b: string) => {
    const i = highlightPath.indexOf(a);
    return i >= 0 && highlightPath[i + 1] === b;
  };

  return (
    <svg viewBox="0 0 400 300" className="w-full" role="img" aria-label="Knowledge graph">
      {edges.map((e) => {
        const f = byId.get(e.fromId);
        const t = byId.get(e.toId);
        if (!f || !t) return null;
        const hot = onPath(e.fromId, e.toId);
        return (
          <g key={`${e.fromId}-${e.toId}-${e.type}`}>
            <line
              x1={f.graphX + 20}
              y1={f.graphY + 14}
              x2={t.graphX + 20}
              y2={t.graphY + 14}
              stroke={hot ? "#8b9cf9" : e.type === "PREREQUISITE_OF" ? "#3a4356" : "#2a3040"}
              strokeWidth={hot ? 2.5 : 1.5}
              strokeDasharray={e.type === "RELATED_TO" ? "5 4" : e.type === "COMMONLY_CONFUSED_WITH" ? "2 3" : undefined}
            />
          </g>
        );
      })}
      {concepts.map((c) => {
        const s = stateById.get(c.id);
        const color = STATUS_COLOR[s?.status ?? "UNKNOWN"] ?? "#5b6472";
        const isBottleneck = c.id === bottleneckId;
        const r = 8 + (s?.mastery ?? 0) * 6;
        return (
          <g key={c.id}>
            {isBottleneck && (
              <circle cx={c.graphX + 20} cy={c.graphY + 14} r={r + 5} fill="none" stroke="#8b9cf9" strokeWidth={1.5} strokeDasharray="3 3" />
            )}
            <circle cx={c.graphX + 20} cy={c.graphY + 14} r={r} fill={color} fillOpacity={0.85} />
            <text
              x={c.graphX + 20}
              y={c.graphY + 14 + r + 12}
              textAnchor="middle"
              className="fill-[#8a93a5]"
              style={{ fontSize: 9.5 }}
            >
              {c.name}
            </text>
            {s && (
              <text
                x={c.graphX + 20}
                y={c.graphY + 17.5}
                textAnchor="middle"
                style={{ fontSize: 8.5, fontWeight: 600 }}
                className="fill-black/80"
              >
                {Math.round(s.mastery * 100)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
