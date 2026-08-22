import type { Confidence, MisconceptionId } from "./types";

// ---------------------------------------------------------------------------
// Every deterministic rule of the engine lives in this file, on purpose:
// judges can read the entire learner-model policy on one screen.
// ---------------------------------------------------------------------------

/** Mastery update: m' = clamp01(m + alpha * (e - m)), |delta| <= DELTA_CAP. */
export const DELTA_CAP = 0.25;

/**
 * Asymmetric learning-rate table - the confidence-calibration feature.
 * A confidently-wrong answer (0.45) moves the model MORE than an honest
 * "I'm guessing" miss (0.15): miscalibration is the stronger signal.
 */
export const ALPHA: Record<"correct" | "incorrect", Record<Confidence, number>> = {
  correct: { GUESSING: 0.25, SOMEWHAT: 0.3, CONFIDENT: 0.35 },
  incorrect: { GUESSING: 0.15, SOMEWHAT: 0.3, CONFIDENT: 0.45 },
};

/** Evidence value per rubric finding. */
export const FINDING_WEIGHT = { PRESENT: 1, MISAPPLIED: 0.25, ABSENT: 0 } as const;

/** e >= this counts as "correct" for alpha selection + targeted-correction checks. */
export const CORRECT_EVIDENCE_THRESHOLD = 0.65;
/** e >= this counts as PARTIAL (else INCORRECT) when deriving the correctness label. */
export const PARTIAL_EVIDENCE_THRESHOLD = 0.35;

/** Status thresholds (mastery): < WEAK_MAX -> WEAK, etc. */
export const STATUS_THRESHOLDS = { WEAK_MAX: 0.35, DEVELOPING_MAX: 0.65, STRONG_MAX: 0.85 };

/** Misconception lifecycle. */
export const MISCONCEPTION_RULES = {
  DETECTED_FLOOR: 0.7, // on detection: score = max(current, 0.7)
  RECONFIRM_BUMP: 0.2, // repeated evidence: score += 0.2
  TARGETED_CORRECT_FACTOR: 0.25, // correct answer to a question targeting it: score *= 0.25
  ACTIVE_ABOVE: 0.5, // status shows MISCONCEPTION_DETECTED above this
  RESOLVING_BELOW: 0.3, // below this -> RESOLVING; 2 confirmations to fully clear
  CONFIRMATIONS_TO_RESOLVE: 2,
};

/** Bottleneck search: only concepts below this mastery can block progress. */
export const BOTTLENECK_CANDIDATE_BELOW = 0.5;
/** Strategy selection boundaries. */
export const STRATEGY_RULES = {
  MISCONCEPTION_ABOVE: 0.5, // -> CONCEPTUAL_CORRECTION
  PREREQ_REMEDIATION_BELOW: 0.4, // -> PREREQUISITE_REMEDIATION
  GUIDED_HINT_BELOW: 0.7, // -> GUIDED_HINT, else CHALLENGE_PROBLEM
};

/** Answers shorter than this (or with no letters) never reach the LLM. */
export const MIN_ANSWER_CHARS = 15;
export const MAX_ANSWER_CHARS = 2000;

/**
 * Closed misconception taxonomy. The analysis responseSchema is enum-locked
 * to these ids - Gemini cannot invent a misconception outside this list.
 */
export const MISCONCEPTIONS: Record<
  MisconceptionId,
  { label: string; targetConceptId: string }
> = {
  SPEED_WITHOUT_MECHANISM: {
    label: "Knows binary search is faster but cannot explain the halving mechanism",
    targetConceptId: "search_space_reduction",
  },
  SEQUENTIAL_SCAN_CONFUSION: {
    label: "Believes binary search scans elements one-by-one (confuses it with linear search)",
    targetConceptId: "binary_search",
  },
  HALF_ELIMINATION_MISAPPLIED: {
    label: "Eliminates the wrong half of the search space, or mishandles the midpoint",
    targetConceptId: "search_space_reduction",
  },
};
