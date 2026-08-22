import {
  ALPHA,
  CORRECT_EVIDENCE_THRESHOLD,
  DELTA_CAP,
  FINDING_WEIGHT,
  PARTIAL_EVIDENCE_THRESHOLD,
  STATUS_THRESHOLDS,
} from "./constants";
import type {
  ConceptEvidence,
  ConceptStatus,
  Confidence,
  Correctness,
} from "./types";

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Average evidence value across the rubric findings (0..1). */
export function evidenceScore(evidence: ConceptEvidence[]): number {
  if (evidence.length === 0) return 0;
  const sum = evidence.reduce((acc, ev) => acc + FINDING_WEIGHT[ev.finding], 0);
  return sum / evidence.length;
}

/** Backend-derived correctness label - computed from rubric enums, never asked of the LLM. */
export function deriveCorrectness(e: number): Correctness {
  if (e >= CORRECT_EVIDENCE_THRESHOLD) return "CORRECT";
  if (e >= PARTIAL_EVIDENCE_THRESHOLD) return "PARTIAL";
  return "INCORRECT";
}

/**
 * Asymmetric EMA update. Confidently-wrong moves the model hardest (alpha 0.45);
 * an honest "guessing" miss moves it least (0.15). Per-turn delta capped so one
 * answer never teleports a mastery bar.
 */
export function updateMastery(
  prev: number,
  e: number,
  confidence: Confidence,
): { next: number; delta: number; alpha: number } {
  const band = e >= CORRECT_EVIDENCE_THRESHOLD ? "correct" : "incorrect";
  const alpha = ALPHA[band][confidence];
  const rawNext = clamp01(prev + alpha * (e - prev));
  const delta = Math.max(-DELTA_CAP, Math.min(DELTA_CAP, rawNext - prev));
  const next = clamp01(prev + delta);
  return { next, delta: next - prev, alpha };
}

/** Status from mastery + misconception state. Misconception overrides the mastery bands. */
export function deriveStatus(
  mastery: number,
  misconceptionScore: number,
  attempts: number,
  resolvingCount: number,
): ConceptStatus {
  if (misconceptionScore > 0.5) return "MISCONCEPTION_DETECTED";
  if (misconceptionScore > 0 && resolvingCount > 0) return "RESOLVING";
  if (attempts === 0) return "UNKNOWN";
  const { WEAK_MAX, DEVELOPING_MAX, STRONG_MAX } = STATUS_THRESHOLDS;
  if (mastery < WEAK_MAX) return "WEAK";
  if (mastery < DEVELOPING_MAX) return "DEVELOPING";
  if (mastery < STRONG_MAX) return "STRONG";
  return "MASTERED";
}
