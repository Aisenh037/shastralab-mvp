import type { AnalysisResult, QuestionSpec } from "./engine/types";
import { CONCEPTS } from "./seed-data";

const conceptById = new Map(CONCEPTS.map((c) => [c.id, c]));

/**
 * Deterministic heuristic scorer - engaged ONLY when the LLM is unavailable,
 * and always loudly labeled in the UI ("ENGINE FALLBACK - no LLM call").
 * It honestly computes keyword overlap against each expected concept; it does
 * NOT diagnose misconceptions and NEVER generates intervention prose, because
 * pretending either came from AI would be a fake AI response.
 */
export function heuristicAnalysis(question: QuestionSpec, answer: string): AnalysisResult {
  const normalized = answer.toLowerCase();
  const concept_evidence = question.expectedConceptIds.map((id) => {
    const keywords = conceptById.get(id)?.keywords ?? [];
    const hits = keywords.filter((k) => normalized.includes(k)).length;
    const finding = hits >= 2 ? "PRESENT" : hits === 1 ? "MISAPPLIED" : "ABSENT";
    return { concept_id: id, finding } as const;
  });
  return {
    verdict: "GRADED",
    concept_evidence: [...concept_evidence],
    misconception: "NONE", // a keyword matcher cannot honestly diagnose beliefs
    evidence_quote: "",
    confidence: 0.3,
    reasoning_summary:
      "Heuristic keyword scoring (AI unavailable): findings reflect keyword overlap with the rubric, not reasoning analysis.",
  };
}
