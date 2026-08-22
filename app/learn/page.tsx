"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LeftRail } from "@/components/left-rail";
import { RightRail } from "@/components/right-rail";
import { TurnResults } from "@/components/turn-results";
import { Chip, Panel } from "@/components/ui";
import type { LearnerState, Receipt, TurnResult } from "@/lib/ui-types";

// ---------------------------------------------------------------------------
// The lab bench. This page owns orchestration only (fetch, submit, session);
// presentation lives in components/left-rail, turn-results, and right-rail.
// ---------------------------------------------------------------------------

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

/** Fetches the learner state; throws with the API's message on failure. */
async function fetchLearnerState(): Promise<LearnerState> {
  const res = await fetch("/api/learner/state");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load learner state");
  return data as LearnerState;
}

export default function LearnPage() {
  const router = useRouter();
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
    try {
      setState(await fetchLearnerState());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load learner state");
    }
  }, []);

  // Initial load; guarded against updates after unmount.
  useEffect(() => {
    let cancelled = false;
    fetchLearnerState()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load learner state");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Advances the "loop running" step list; reset to 0 happens in submit().
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setRunningStep((s) => Math.min(s + 1, RUNNING_STEPS.length - 1)), 1100);
    return () => clearInterval(t);
  }, [running]);

  async function submit() {
    if (!answer.trim() || running) return;
    setRunningStep(0);
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
    router.push("/");
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

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 p-4">
      <header className="mb-4 flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold tracking-tight">
            Shastra<span className="text-gemini">Lab</span>
          </span>
          <span className="hidden font-mono text-[11px] text-muted sm:inline">diagnose first · teach second</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[11px] text-muted md:inline">
            {state.user ? `${state.user.name} (${state.user.email})` : "guest session"} · topic:{" "}
            {nameById.get(state.topicId)}
          </span>
          {state.user ? (
            <button
              type="button"
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
            type="button"
            onClick={resetSession}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition hover:border-danger/50 hover:text-danger"
          >
            Reset session
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[230px_minmax(0,1fr)_340px]">
        <LeftRail
          pathOrder={state.pathOrder}
          stateById={stateById}
          nameById={nameById}
          currentTargetId={q?.targetConceptId}
        />

        {/* CENTER: the adaptive loop */}
        <section className="min-w-0 space-y-4">
          {q && (
            <Panel
              title={`Question · targets ${nameById.get(q.targetConceptId) ?? q.targetConceptId} · ${q.difficulty.toLowerCase()}`}
              chip={q.source === "GEMINI" ? <Chip kind="GEMINI">generated</Chip> : <Chip kind="BANK">curriculum bank</Chip>}
              flash={!!turn}
            >
              <p className="text-[15px] leading-6">{q.question}</p>
              {q.why && <p className="mt-2 text-xs italic text-muted">why this question: {q.why}</p>}
            </Panel>
          )}

          <Panel title="Your answer">
            <textarea
              aria-label="Your answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
              }}
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
                    type="button"
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
                type="button"
                onClick={submit}
                disabled={running || !answer.trim()}
                className="rounded-lg bg-gemini px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running ? "Diagnosing…" : "Submit for diagnosis"}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Your confidence feeds the calibration model: confidently-wrong shifts the learner model harder than an
              honest guess.
            </p>
          </Panel>

          {error && <div className="rounded-xl border border-danger/50 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

          {running && (
            <Panel title="Adaptive loop running" chip={<Chip kind="ENGINE" />}>
              <ul className="space-y-1.5 font-mono text-xs">
                {RUNNING_STEPS.map((s, i) => (
                  <li
                    key={s}
                    className={
                      i < runningStep ? "text-engine" : i === runningStep ? "animate-pulse text-foreground" : "text-muted/50"
                    }
                  >
                    {i < runningStep ? "✓" : i === runningStep ? "▸" : "·"} {s}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div ref={resultRef} aria-live="polite" role="status" className="sr-only">
            {turn ? "Diagnosis ready" : ""}
          </div>

          {turn && !running && <TurnResults turn={turn} nameById={nameById} />}
        </section>

        <RightRail state={state} turn={turn} activity={activity} turnCount={turnCount} nameById={nameById} />
      </div>
    </main>
  );
}
