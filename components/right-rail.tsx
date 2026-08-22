import { misconceptionDisplay } from "@/lib/engine/constants";
import { KnowledgeGraph } from "./graph";
import { Chip, MasteryBar, Panel } from "./ui";
import type { LearnerState, Receipt, TurnResult } from "@/lib/ui-types";

/** Right pane: the live learner model, graph, Lab Report, and AI activity log. */
export function RightRail({
  state,
  turn,
  activity,
  turnCount,
  nameById,
}: {
  state: LearnerState;
  turn: TurnResult | null;
  activity: Receipt[];
  turnCount: number;
  nameById: Map<string, string>;
}) {
  const stateById = new Map(state.states.map((s) => [s.conceptId, s]));
  const topic = stateById.get(state.topicId);
  const activeMisconception = state.states.find((s) => s.misconceptionId && s.misconceptionScore > 0);

  return (
    <aside className="space-y-4">
      <Panel title="Learner model" chip={<Chip kind="ENGINE" />}>
        <div className="space-y-3">
          {topic && (
            <MasteryBar label={`${nameById.get(state.topicId)} (topic)`} value={topic.mastery} status={topic.status} />
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="min-w-0 rounded-md bg-panel-2 p-2">
              <p className="text-muted">current root cause</p>
              <p className="mt-0.5 break-words text-foreground">
                {state.bottleneckId ? nameById.get(state.bottleneckId) : "none found yet"}
              </p>
            </div>
            <div className="min-w-0 rounded-md bg-panel-2 p-2">
              <p className="text-muted">active misconception</p>
              <p
                title={activeMisconception?.misconceptionId ?? undefined}
                className={`mt-0.5 break-words ${
                  activeMisconception
                    ? activeMisconception.status === "RESOLVING"
                      ? "text-resolving"
                      : "text-danger"
                    : "text-engine"
                }`}
              >
                {activeMisconception
                  ? `${misconceptionDisplay(activeMisconception.misconceptionId)}${activeMisconception.status === "RESOLVING" ? " (resolving)" : ""}`
                  : "none active"}
              </p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Knowledge graph" chip={<Chip kind="ENGINE" />}>
        <KnowledgeGraph
          concepts={state.concepts}
          edges={state.edges}
          states={state.states}
          highlightPath={turn?.kind === "TURN" ? (turn.bottleneck?.path ?? []) : []}
          bottleneckId={state.bottleneckId}
        />
        <p className="mt-1 text-[10px] leading-4 text-muted">
          solid = prerequisite · dashed = related · dotted = commonly confused. Node size grows with mastery; the dashed
          ring marks the current root cause.
        </p>
      </Panel>

      <Panel title="Lab report" chip={<Chip kind="ENGINE">from execution logs</Chip>}>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-md bg-panel-2 p-2">
            <p className="font-mono text-lg text-gemini">{state.labTotals.geminiCalls}</p>
            <p className="text-[10px] text-muted">real Gemini calls</p>
          </div>
          <div className="rounded-md bg-panel-2 p-2">
            <p className="font-mono text-lg text-foreground">{(state.labTotals.totalLatencyMs / 1000).toFixed(1)}s</p>
            <p className="text-[10px] text-muted">total AI latency</p>
          </div>
          <div className="rounded-md bg-panel-2 p-2">
            <p className="font-mono text-lg text-foreground">{state.labTotals.totalTokens}</p>
            <p className="text-[10px] text-muted">output tokens</p>
          </div>
          <div className="rounded-md bg-panel-2 p-2">
            <p className="font-mono text-lg text-engine">{turnCount}</p>
            <p className="text-[10px] text-muted">loop turns (this visit)</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted">0 canned responses - every AI panel above is a logged live call.</p>
      </Panel>

      <Panel title="AI activity" chip={<Chip kind="ENGINE">real timestamps</Chip>}>
        {activity.length === 0 ? (
          <p className="text-xs text-muted">Submit an answer to watch the loop execute step by step.</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto font-mono text-[10.5px] leading-4">
            {activity.map((r) => (
              <li key={`${r.at}-${r.step}`} className="flex gap-2">
                <span className="shrink-0 text-muted">{new Date(r.at).toLocaleTimeString()}</span>
                <span
                  className={r.owner === "GEMINI" ? "text-gemini" : r.owner === "FALLBACK" ? "text-warn" : "text-engine"}
                >
                  {r.step}
                </span>
                <span className="truncate text-muted" title={r.note}>
                  {r.note}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </aside>
  );
}
