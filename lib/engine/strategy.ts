import { MISCONCEPTIONS, STRATEGY_RULES as R } from "./constants";
import type { BottleneckResult } from "./bottleneck";
import type { ConceptStateView, MisconceptionId, StrategyId } from "./types";

export interface StrategyDecision {
  strategy: StrategyId;
  targetConceptId: string;
  targetsMisconceptionId: MisconceptionId | null;
  objective: string;
}

/**
 * Deterministic strategy selection - the application decides WHAT intervention
 * is needed; Gemini only decides HOW to say it.
 */
export function selectStrategy(
  states: Map<string, ConceptStateView>,
  bottleneck: BottleneckResult,
  topicId: string,
  conceptNames: Map<string, string>,
): StrategyDecision {
  const name = (id: string) => conceptNames.get(id) ?? id;

  // 1. An active misconception outranks everything.
  let worst: ConceptStateView | null = null;
  for (const s of states.values()) {
    if (s.misconceptionScore > R.MISCONCEPTION_ABOVE && s.misconceptionId) {
      if (!worst || s.misconceptionScore > worst.misconceptionScore) worst = s;
    }
  }
  if (worst) {
    const mid = worst.misconceptionId as MisconceptionId;
    const target = MISCONCEPTIONS[mid]?.targetConceptId ?? worst.conceptId;
    return {
      strategy: "CONCEPTUAL_CORRECTION",
      targetConceptId: target,
      targetsMisconceptionId: mid,
      objective: `Directly challenge the misconception "${MISCONCEPTIONS[mid]?.label ?? mid}" and rebuild ${name(target)} on concepts the learner already trusts.`,
    };
  }

  // 2. A weak upstream prerequisite comes before more topic practice.
  if (bottleneck.conceptId) {
    const m = states.get(bottleneck.conceptId)?.mastery ?? 0;
    if (m < R.PREREQ_REMEDIATION_BELOW) {
      return {
        strategy: "PREREQUISITE_REMEDIATION",
        targetConceptId: bottleneck.conceptId,
        targetsMisconceptionId: null,
        objective: `Strengthen the prerequisite ${name(bottleneck.conceptId)} before returning to ${name(topicId)}.`,
      };
    }
  }

  // 3. Otherwise scale with topic mastery.
  const topicMastery = states.get(topicId)?.mastery ?? 0;
  if (topicMastery < R.GUIDED_HINT_BELOW) {
    return {
      strategy: "GUIDED_HINT",
      targetConceptId: bottleneck.conceptId ?? topicId,
      targetsMisconceptionId: null,
      objective: `Guide the learner one step deeper into ${name(bottleneck.conceptId ?? topicId)} without giving the answer away.`,
    };
  }
  return {
    strategy: "CHALLENGE_PROBLEM",
    targetConceptId: topicId,
    targetsMisconceptionId: null,
    objective: `Move ${name(topicId)} from understanding to application with a challenge problem.`,
  };
}
