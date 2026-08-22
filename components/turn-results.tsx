import { Chip, MasteryBar, Panel } from "./ui";
import type { CompiledPromptView, TurnResult } from "@/lib/ui-types";

const FINDING_ICON: Record<string, string> = { PRESENT: "✓", MISAPPLIED: "△", ABSENT: "✗" };
const FINDING_CLASS: Record<string, string> = {
  PRESENT: "text-engine",
  MISAPPLIED: "text-warn",
  ABSENT: "text-danger",
};

const CORRECTNESS_CLASS: Record<string, string> = {
  CORRECT: "bg-engine/15 text-engine",
  PARTIAL: "bg-warn/15 text-warn",
  INCORRECT: "bg-danger/15 text-danger",
};

function misconceptionEventLabel(event: string, label: string): string {
  if (event === "RESOLVING") return `misconception resolving (confirmation 1 of 2): ${label}`;
  if (event === "RESOLVED") return `misconception fully resolved: ${label}`;
  return `misconception ${event.toLowerCase()}: ${label}`;
}

function PromptBlocks({ prompt }: { prompt: CompiledPromptView }) {
  return (
    <div className="mt-2 space-y-2">
      {prompt.blocks.map((b) => (
        <div
          key={b.label}
          className={`rounded-md border p-2 ${b.fromGraph ? "border-gemini/40 bg-gemini/5" : "border-line bg-panel-2"}`}
        >
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {b.label}
            {b.fromGraph && <span className="text-gemini"> · from graph</span>}
          </p>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-5 text-foreground/85">{b.text}</pre>
        </div>
      ))}
    </div>
  );
}

/** Center pane, below the answer form: everything one adaptive-loop turn produced. */
export function TurnResults({
  turn,
  nameById,
}: {
  turn: TurnResult;
  nameById: Map<string, string>;
}) {
  if (turn.kind === "INSUFFICIENT_EVIDENCE") {
    return (
      <Panel title="Diagnosis: insufficient evidence" chip={<Chip kind="ENGINE">no state change</Chip>}>
        <p className="text-sm text-warn">{turn.message}</p>
        <p className="mt-2 text-xs text-muted">
          Loop invariant I3: an ungradeable answer writes nothing to the knowledge graph - no hallucinated learner state.
        </p>
      </Panel>
    );
  }

  return (
    <>
      {/* DIAGNOSIS */}
      <Panel
        title="Diagnosis"
        chip={
          turn.analysisSource === "GEMINI" ? (
            <Chip kind="GEMINI">
              {turn.analysisMeta?.model} · {((turn.analysisMeta?.latencyMs ?? 0) / 1000).toFixed(1)}s ·{" "}
              {turn.analysisMeta?.outputTokens} tok
            </Chip>
          ) : (
            <Chip kind="FALLBACK">heuristic scoring · no LLM call</Chip>
          )
        }
        flash
      >
        {turn.analysisSource === "FALLBACK" && (
          <p className="mb-2 rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
            AI temporarily unavailable - findings below come from deterministic keyword scoring, honestly labeled. No
            AI-generated content on this card.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-1 font-mono text-xs ${CORRECTNESS_CLASS[turn.correctness ?? ""] ?? ""}`}>
            {turn.correctness}
          </span>
          <span className="font-mono text-[11px] text-muted">
            derived by the engine from rubric enums - the model never emits a score
          </span>
        </div>
        {turn.analysis?.reasoning_summary && (
          <p className="mt-3 text-sm leading-6 text-foreground/90">{turn.analysis.reasoning_summary}</p>
        )}
        <ul className="mt-3 space-y-1.5">
          {turn.analysis?.concept_evidence.map((ev) => (
            <li key={ev.concept_id} className="flex items-center gap-2 text-sm">
              <span className={`font-mono ${FINDING_CLASS[ev.finding]}`}>{FINDING_ICON[ev.finding]}</span>
              <span>{nameById.get(ev.concept_id) ?? ev.concept_id}</span>
              <span className="font-mono text-[11px] text-muted">{ev.finding}</span>
            </li>
          ))}
        </ul>
        {turn.analysis && turn.analysis.misconception !== "NONE" && (
          <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-3">
            <p className="font-mono text-xs text-danger">root cause (nidān): {turn.analysis.misconception}</p>
            {turn.analysis.evidence_quote && (
              <p className="mt-1 text-xs text-muted">your words: “{turn.analysis.evidence_quote}”</p>
            )}
          </div>
        )}
        {turn.calibration && (
          <p className="mt-3 rounded-md bg-panel-2 p-2 font-mono text-[11px] text-muted">
            calibration · self-reported <span className="text-foreground">{turn.calibration.confidence}</span> · scored{" "}
            <span className="text-foreground">{turn.calibration.correctness}</span> → update weight α=
            <span className={turn.calibration.alpha >= 0.45 ? "text-danger" : "text-foreground"}>
              {turn.calibration.alpha}
            </span>
            {turn.calibration.alpha >= 0.45 && " (confidently wrong - strongest signal)"}
          </p>
        )}
      </Panel>

      {/* GRAPH DELTA */}
      {turn.graphDelta && turn.graphDelta.length > 0 && (
        <Panel title="Knowledge graph updated" chip={<Chip kind="ENGINE">deterministic · no LLM</Chip>} flash>
          <div className="space-y-3">
            {turn.graphDelta.map((d) => (
              <MasteryBar
                key={d.conceptId}
                label={`${d.name} (${d.finding.toLowerCase()}, α=${d.alpha})`}
                value={d.after}
                status={d.statusAfter}
                delta={d.after - d.before}
              />
            ))}
          </div>
          {turn.misconceptionEvents?.map((m) => (
            <p
              key={m.conceptId + m.event}
              className={`mt-3 rounded-md p-2 font-mono text-xs ${
                m.event === "RESOLVING" || m.event === "RESOLVED"
                  ? "bg-resolving/10 text-resolving"
                  : "bg-danger/10 text-danger"
              }`}
            >
              {misconceptionEventLabel(m.event, m.label)}
            </p>
          ))}
        </Panel>
      )}

      {/* ROOT CAUSE */}
      {turn.bottleneck && (
        <Panel title="Root-cause search" chip={<Chip kind="ENGINE">graph traversal · 0ms · no LLM</Chip>}>
          <p className="text-sm leading-6">{turn.bottleneck.reason}</p>
          {turn.strategy && (
            <p className="mt-2 text-xs text-muted">
              → prescription strategy: <span className="font-mono text-gemini">{turn.strategy.strategy}</span> targeting{" "}
              <span className="text-foreground">{nameById.get(turn.strategy.targetConceptId)}</span>
            </p>
          )}
        </Panel>
      )}

      {/* PRESCRIPTION */}
      {turn.intervention &&
        (turn.intervention.source === "GEMINI" ? (
          <Panel
            title="Prescription"
            chip={
              <Chip kind="GEMINI">
                {turn.interventionMeta?.model} · {((turn.interventionMeta?.latencyMs ?? 0) / 1000).toFixed(1)}s ·{" "}
                {turn.interventionMeta?.outputTokens} tok
              </Chip>
            }
            flash
          >
            <p className="whitespace-pre-line text-[15px] leading-7">{turn.intervention.text}</p>
            {turn.intervention.leverages.length > 0 && (
              <p className="mt-3 font-mono text-[11px] text-muted">
                built on your strong concepts: {turn.intervention.leverages.map((id) => nameById.get(id) ?? id).join(", ")}
              </p>
            )}
          </Panel>
        ) : (
          <Panel title="Prescription" chip={<Chip kind="FALLBACK">AI unavailable</Chip>}>
            <p className="text-sm text-warn">
              AI generation is temporarily unavailable, so no explanation is shown - this system never fabricates AI
              output. An authored practice question from the curriculum bank has been queued above instead. Retry on the
              next answer.
            </p>
          </Panel>
        ))}

      {/* AI REASONING CONTEXT */}
      {turn.compiledPrompts?.analysis && (
        <Panel title="AI reasoning context - the compiled prompts" chip={<Chip kind="ENGINE">prompt compiler</Chip>}>
          <p className="mb-2 text-xs text-muted">
            Prompts are compiled from the knowledge graph per turn - highlighted blocks were injected from YOUR learner
            state. This is the exact text sent to Gemini, logged verbatim.
          </p>
          <details open className="mb-2">
            <summary className="cursor-pointer font-mono text-xs text-gemini">call A - rubric analysis prompt</summary>
            <PromptBlocks prompt={turn.compiledPrompts.analysis} />
          </details>
          {turn.compiledPrompts.generation && (
            <details>
              <summary className="cursor-pointer font-mono text-xs text-gemini">
                call B - intervention + next-question prompt
              </summary>
              <PromptBlocks prompt={turn.compiledPrompts.generation} />
            </details>
          )}
        </Panel>
      )}
    </>
  );
}
