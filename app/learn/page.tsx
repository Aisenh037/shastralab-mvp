"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { KnowledgeGraph } from "@/components/graph";
import { Chip, MasteryBar, Panel, STATUS_COLOR } from "@/components/ui";

// ---------------------------------------------------------------------------
// The lab bench: left = learning path, center = the adaptive loop,
// right = live learner model + AI activity + Lab Report.
// Every panel renders ONLY fields of real API payloads (loop invariant I5).
// ---------------------------------------------------------------------------

interface ConceptRow { id: string; name: string; graphX: number; graphY: number }
interface EdgeRow { fromId: string; toId: string; type: string }
interface StateRow {
  conceptId: string; mastery: number; misconceptionScore: number;
  misconceptionId: string | null; status: string; attempts: number; resolvingCount: number;
}
interface Question {
  question: string; targetConceptId: string; expectedConceptIds: string[];
  difficulty: string; why: string; source: string;
}
interface LearnerState {
  learnerId: string; name: string; user: { email: string; name: string } | null;
  topicId: string; bottleneckId: string | null;
  currentQuestion: Question; states: StateRow[]; concepts: ConceptRow[]; edges: EdgeRow[];
  pathOrder: string[]; labTotals: { geminiCalls: number; totalLatencyMs: number; totalTokens: number };
}
interface Receipt { step: string; owner: string; ms: number; note: string; at: string }
interface PromptBlock { label: string; text: string; fromGraph?: boolean }
interface TurnResult {
  kind: "TURN" | "INSUFFICIENT_EVIDENCE";
  message?: string;
  analysis?: {
    concept_evidence: { concept_id: string; finding: string }[];
    misconception: string; evidence_quote: string; reasoning_summary: string; confidence: number;
  };
  analysisSource?: string;
  analysisMeta?: { latencyMs: number; outputTokens: number; model: string };
  correctness?: string;
  calibration?: { confidence: string; correctness: string; alpha: number };
  graphDelta?: { conceptId: string; name: string; before: number; after: number; statusAfter: string; finding: string; alpha: number }[];
  misconceptionEvents?: { conceptId: string; event: string; label: string }[];
  bottleneck?: { conceptId: string | null; path: string[]; reason: string; decoy: { conceptId: string; mastery: number } | null };
  strategy?: { strategy: string; targetConceptId: string; objective: string };
  compiledPrompts?: { analysis?: { text: string; blocks: PromptBlock[] }; generation?: { text: string; blocks: PromptBlock[] } };
  intervention?: { text: string; leverages: string[]; source: string };
  interventionMeta?: { latencyMs: number; outputTokens: number; model: string };
  nextQuestion?: Question;
  receipts: Receipt[];
  labTotals?: { geminiCalls: number; totalLatencyMs: number; totalTokens: number };
  error?: string;
}

const RUNNING_STEPS = [
  "Observing answer",
  "Compiling analysis prompt from graph state",
  "Calling Gemini (rubric analysis)",
  "Validating structured output (Zod)",
  "Updating knowledge graph (deterministic)",
  "Finding root cause on prerequisite path",
  "Compiling adaptive prompt",
  "Calling Gemini (intervention + next question)",
];

const CONFIDENCE_OPTIONS = [
  { id: "GUESSING", label: "Guessing" },
  { id: "SOMEWHAT", label: "Somewhat sure" },
  { id: "CONFIDENT", label: "Confident" },
] as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const FINDING_ICON: Record<string, string> = { PRESENT: "✓", MISAPPLIED: "△", ABSENT: "✗" };
const FINDING_CLASS: Record<string, string> = {
  PRESENT: "text-engine",
  MISAPPLIED: "text-warn",
  ABSENT: "text-danger",
};

export default function LearnPage() {
  const [state, setState] = useState<LearnerState | null>(null);
  const [turn, setTurn] = useState<TurnResult | null>(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState<string>("SOMEWHAT");
  const [running, setRunning] = useState(false);
  const [runningStep, setRunningStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Receipt[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  const loadState = useCallback(async () => {
    const res = await fetch("/api/learner/state");
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Failed to load learner state");
    else setState(data);
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    if (!running) return;
    setRunningStep(0);
    const t = setInterval(() => setRunningStep((s) => Math.min(s + 1, RUNNING_STEPS.length - 1)), 1100);
    return () => clearInterval(t);
  }, [running]);

  async function submit() {
    if (!answer.trim() || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, confidence }),
      });
      const data: TurnResult & { error?: string } = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Your answer is still in the box - please retry.");
      } else {
        setTurn(data);
        setActivity((a) => [...data.receipts, ...a].slice(0, 40));
        if (data.kind === "TURN") {
          setTurnCount((n) => n + 1);
          setAnswer("");
        }
        await loadState();
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
      }
    } catch {
      setError("Network error - your answer is still in the box. Please retry.");
    } finally {
      setRunning(false);
    }
  }

  async function resetSession() {
    await fetch("/api/demo/reset", { method: "POST" });
    window.location.reload();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  if (!state) {
    return (
      <main className="flex flex-1 items-center justify-center text-muted">
        {error ? (
          <div className="max-w-md rounded-xl border border-danger/40 bg-panel p-6 text-sm">
            <p className="text-danger">{error}</p>
            <p className="mt-2 text-muted">If this is a fresh deploy, seed the database with npm run demo:reset.</p>
          </div>
        ) : (
          <p className="animate-pulse font-mono text-sm">loading learner model…</p>
        )}
      </main>
    );
  }

  const stateById = new Map(state.states.map((s) => [s.conceptId, s]));
  const nameById = new Map(state.concepts.map((c) => [c.id, c.name]));
  const q = state.currentQuestion;
  const topic = stateById.get(state.topicId);
  const activeMisconception = state.states.find((s) => s.misconceptionId && s.misconceptionScore > 0);

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 p-4">
      {/* Top bar */}
      <header className="mb-4 flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold tracking-tight">
            Shastra<span className="text-gemini">Lab</span>
          </span>
          <span className="hidden font-mono text-[11px] text-muted sm:inline">diagnose first · teach second</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[11px] text-muted md:inline">
            {state.user ? `${state.user.name} (${state.user.email})` : `guest session`} · topic: {nameById.get(state.topicId)}
          </span>
          {state.user ? (
            <button
              onClick={logout}
              className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition hover:border-gemini/50 hover:text-gemini"
            >
              Log out
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-gemini/40 px-3 py-1.5 text-xs text-gemini transition hover:bg-gemini/5"
            >
              Sign in
            </Link>
          )}
          <button
            onClick={resetSession}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition hover:border-danger/50 hover:text-danger"
          >
            Reset session
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[230px_minmax(0,1fr)_340px]">
        {/* LEFT: learning path */}
        <aside className="space-y-4">
          <Panel title="Learning path" chip={<Chip kind="ENGINE" />}>
            <ul className="space-y-2 text-sm">
              {state.pathOrder.map((id) => {
                const s = stateById.get(id);
                const isCurrent = q?.targetConceptId === id;
                const icon =
                  s?.status === "MISCONCEPTION_DETECTED" ? "✗" :
                  s?.status === "RESOLVING" ? "◎" :
                  s?.status === "MASTERED" || s?.status === "STRONG" ? "✓" :
                  s?.status === "DEVELOPING" ? "◐" : "○";
                return (
                  <li key={id} className={`flex items-center justify-between ${isCurrent ? "text-foreground" : "text-muted"}`}>
                    <span className="flex items-center gap-2">
                      <span style={{ color: STATUS_COLOR[s?.status ?? "UNKNOWN"] }}>{icon}</span>
                      {nameById.get(id)}
                    </span>
                    {isCurrent && <span className="font-mono text-[10px] text-gemini">● current</span>}
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title="How to read this" >
            <p className="text-xs leading-5 text-muted">
              <span className="text-engine">⚙ ENGINE</span> panels are deterministic - no LLM ever writes learner state.{" "}
              <span className="text-gemini">✦ GEMINI</span> panels are real model calls, each logged with latency and tokens.
            </p>
          </Panel>
        </aside>

        {/* CENTER: the adaptive loop */}
        <section className="min-w-0 space-y-4">
          {q && (
            <Panel
              title={`Question · targets ${nameById.get(q.targetConceptId) ?? q.targetConceptId} · ${q.difficulty}`}
              chip={q.source === "GEMINI" ? <Chip kind="GEMINI">generated</Chip> : <Chip kind="BANK">curriculum bank</Chip>}
              flash={!!turn}
            >
              <p className="text-[15px] leading-6">{q.question}</p>
              {q.why && <p className="mt-2 text-xs italic text-muted">why this question: {q.why}</p>}
            </Panel>
          )}

          <Panel title="Your answer" >
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(); }}
              rows={3}
              maxLength={2000}
              placeholder="Type your reasoning in your own words…"
              className="w-full resize-y rounded-lg border border-line bg-panel-2 p-3 text-sm outline-none transition focus:border-gemini/60"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-lg border border-line p-1">
                {CONFIDENCE_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setConfidence(c.id)}
                    className={`rounded-md px-3 py-1.5 text-xs transition ${
                      confidence === c.id ? "bg-gemini/20 text-gemini" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <button
                onClick={submit}
                disabled={running || !answer.trim()}
                className="rounded-lg bg-gemini px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running ? "Diagnosing…" : "Submit for diagnosis"}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Your confidence feeds the calibration model: confidently-wrong shifts the learner model harder than an honest guess.
            </p>
          </Panel>

          {error && (
            <div className="rounded-xl border border-danger/50 bg-danger/10 p-4 text-sm text-danger">
              {error}
            </div>
          )}

          {running && (
            <Panel title="Adaptive loop running" chip={<Chip kind="ENGINE" />}>
              <ul className="space-y-1.5 font-mono text-xs">
                {RUNNING_STEPS.map((s, i) => (
                  <li key={s} className={i < runningStep ? "text-engine" : i === runningStep ? "animate-pulse text-foreground" : "text-muted/50"}>
                    {i < runningStep ? "✓" : i === runningStep ? "▸" : "·"} {s}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div ref={resultRef} />

          {turn?.kind === "INSUFFICIENT_EVIDENCE" && !running && (
            <Panel title="Diagnosis: insufficient evidence" chip={<Chip kind="ENGINE">no state change</Chip>}>
              <p className="text-sm text-warn">{turn.message}</p>
              <p className="mt-2 text-xs text-muted">
                Loop invariant I3: an ungradeable answer writes nothing to the knowledge graph - no hallucinated learner state.
              </p>
            </Panel>
          )}

          {turn?.kind === "TURN" && !running && (
            <>
              {/* DIAGNOSIS */}
              <Panel
                title="Diagnosis"
                chip={
                  turn.analysisSource === "GEMINI" ? (
                    <Chip kind="GEMINI">{turn.analysisMeta?.model} · {((turn.analysisMeta?.latencyMs ?? 0) / 1000).toFixed(1)}s · {turn.analysisMeta?.outputTokens} tok</Chip>
                  ) : (
                    <Chip kind="FALLBACK">heuristic scoring · no LLM call</Chip>
                  )
                }
                flash
              >
                {turn.analysisSource === "FALLBACK" && (
                  <p className="mb-2 rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
                    AI temporarily unavailable - findings below come from deterministic keyword scoring, honestly labeled. No AI-generated content on this card.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-1 font-mono text-xs ${
                    turn.correctness === "CORRECT" ? "bg-engine/15 text-engine" :
                    turn.correctness === "PARTIAL" ? "bg-warn/15 text-warn" : "bg-danger/15 text-danger"
                  }`}>
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
                    <span className={turn.calibration.alpha >= 0.45 ? "text-danger" : "text-foreground"}>{turn.calibration.alpha}</span>
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
                    <p key={m.conceptId + m.event} className={`mt-3 rounded-md p-2 font-mono text-xs ${
                      m.event === "RESOLVING" || m.event === "RESOLVED" ? "bg-resolving/10 text-resolving" : "bg-danger/10 text-danger"
                    }`}>
                      {m.event === "RESOLVING"
                        ? `misconception resolving (confirmation 1 of 2): ${m.label}`
                        : m.event === "RESOLVED"
                        ? `misconception fully resolved: ${m.label}`
                        : `misconception ${m.event.toLowerCase()}: ${m.label}`}
                    </p>
                  ))}
                </Panel>
              )}

              {/* ROOT CAUSE / BOTTLENECK */}
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
              {turn.intervention && (
                turn.intervention.source === "GEMINI" ? (
                  <Panel
                    title="Prescription"
                    chip={<Chip kind="GEMINI">{turn.interventionMeta?.model} · {((turn.interventionMeta?.latencyMs ?? 0) / 1000).toFixed(1)}s · {turn.interventionMeta?.outputTokens} tok</Chip>}
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
                      AI generation is temporarily unavailable, so no explanation is shown - this system never fabricates AI output.
                      An authored practice question from the curriculum bank has been queued above instead. Retry on the next answer.
                    </p>
                  </Panel>
                )
              )}

              {/* AI REASONING CONTEXT (the compiled prompts) */}
              {turn.compiledPrompts?.analysis && (
                <Panel title="AI reasoning context - the compiled prompts" chip={<Chip kind="ENGINE">prompt compiler</Chip>}>
                  <p className="mb-2 text-xs text-muted">
                    Prompts are compiled from the knowledge graph per turn - highlighted blocks were injected from YOUR learner state. This is the exact text sent to Gemini, logged verbatim.
                  </p>
                  <details open className="mb-2">
                    <summary className="cursor-pointer font-mono text-xs text-gemini">call A - rubric analysis prompt</summary>
                    <div className="mt-2 space-y-2">
                      {turn.compiledPrompts.analysis.blocks.map((b) => (
                        <div key={b.label} className={`rounded-md border p-2 ${b.fromGraph ? "border-gemini/40 bg-gemini/5" : "border-line bg-panel-2"}`}>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{b.label}{b.fromGraph && <span className="text-gemini"> · from graph</span>}</p>
                          <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-5 text-foreground/85">{b.text}</pre>
                        </div>
                      ))}
                    </div>
                  </details>
                  {turn.compiledPrompts.generation && (
                    <details>
                      <summary className="cursor-pointer font-mono text-xs text-gemini">call B - intervention + next-question prompt</summary>
                      <div className="mt-2 space-y-2">
                        {turn.compiledPrompts.generation.blocks.map((b) => (
                          <div key={b.label} className={`rounded-md border p-2 ${b.fromGraph ? "border-gemini/40 bg-gemini/5" : "border-line bg-panel-2"}`}>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{b.label}{b.fromGraph && <span className="text-gemini"> · from graph</span>}</p>
                            <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-5 text-foreground/85">{b.text}</pre>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </Panel>
              )}
            </>
          )}
        </section>

        {/* RIGHT: live learner model */}
        <aside className="space-y-4">
          <Panel title="Learner model" chip={<Chip kind="ENGINE" />}>
            <div className="space-y-3">
              {topic && (
                <MasteryBar label={`${nameById.get(state.topicId)} (topic)`} value={topic.mastery} status={topic.status} />
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-panel-2 p-2">
                  <p className="text-muted">current root cause</p>
                  <p className="mt-0.5 text-foreground">{state.bottleneckId ? nameById.get(state.bottleneckId) : "none found yet"}</p>
                </div>
                <div className="rounded-md bg-panel-2 p-2">
                  <p className="text-muted">active misconception</p>
                  <p className={`mt-0.5 ${activeMisconception ? (activeMisconception.status === "RESOLVING" ? "text-resolving" : "text-danger") : "text-engine"}`}>
                    {activeMisconception
                      ? `${activeMisconception.misconceptionId}${activeMisconception.status === "RESOLVING" ? " (resolving)" : ""}`
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
              highlightPath={turn?.kind === "TURN" ? turn.bottleneck?.path ?? [] : []}
              bottleneckId={state.bottleneckId}
            />
            <p className="mt-1 text-[10px] leading-4 text-muted">
              solid = prerequisite · dashed = related · dotted = commonly confused. Node size grows with mastery; the dashed ring marks the current root cause.
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
                {activity.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-muted">{new Date(r.at).toLocaleTimeString()}</span>
                    <span className={r.owner === "GEMINI" ? "text-gemini" : r.owner === "FALLBACK" ? "text-warn" : "text-engine"}>
                      {r.step}
                    </span>
                    <span className="truncate text-muted" title={r.note}>{r.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </main>
  );
}
