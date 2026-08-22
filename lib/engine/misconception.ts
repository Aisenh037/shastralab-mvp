import { MISCONCEPTION_RULES as R } from "./constants";

export type MisconceptionEvent = "DETECTED" | "RECONFIRMED" | "TARGETED_CORRECT";

/**
 * Deterministic misconception lifecycle.
 * DETECTED       -> score = max(current, 0.7)
 * RECONFIRMED    -> score = min(1, score + 0.2)
 * TARGETED_CORRECT (correct answer to a question aimed at this misconception)
 *                -> score *= 0.25 and one resolution confirmation is earned.
 * A misconception is only fully cleared after 2 confirmations - one right
 * answer moves it to RESOLVING, never straight to gone.
 */
export function applyMisconception(
  score: number,
  resolvingCount: number,
  event: MisconceptionEvent,
): { score: number; resolvingCount: number; cleared: boolean } {
  if (event === "DETECTED") {
    return { score: Math.max(score, R.DETECTED_FLOOR), resolvingCount: 0, cleared: false };
  }
  if (event === "RECONFIRMED") {
    return { score: Math.min(1, score + R.RECONFIRM_BUMP), resolvingCount: 0, cleared: false };
  }
  // TARGETED_CORRECT
  const nextScore = score * R.TARGETED_CORRECT_FACTOR;
  const nextCount = resolvingCount + 1;
  const cleared = nextCount >= R.CONFIRMATIONS_TO_RESOLVE;
  return {
    score: cleared ? 0 : nextScore,
    resolvingCount: nextCount,
    cleared,
  };
}
