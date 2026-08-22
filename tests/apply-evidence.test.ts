import { describe, expect, it } from "vitest";
import { applyEvidence } from "../lib/turn/apply-evidence";
import { deriveStatus } from "../lib/engine/mastery";
import type { AnalysisResult, ConceptStateView } from "../lib/engine/types";
import { CONCEPTS, OPENING_QUESTION, TEMPLATE_STATES } from "../lib/seed-data";

const conceptName = new Map(CONCEPTS.map((c) => [c.id, c.name]));

function seededStates(): Map<string, ConceptStateView> {
  return new Map(
    TEMPLATE_STATES.map((s) => [
      s.conceptId,
      {
        conceptId: s.conceptId,
        mastery: s.mastery,
        misconceptionScore: 0,
        misconceptionId: null,
        status: deriveStatus(s.mastery, 0, s.attempts, 0),
        attempts: s.attempts,
        resolvingCount: 0,
      },
    ]),
  );
}

const partialAnalysis: AnalysisResult = {
  verdict: "GRADED",
  concept_evidence: [
    { concept_id: "sorted_arrays", finding: "PRESENT" },
    { concept_id: "search_space_reduction", finding: "ABSENT" },
  ],
  misconception: "SPEED_WITHOUT_MECHANISM",
  evidence_quote: "searching gets much faster",
  confidence: 0.9,
  reasoning_summary: "",
};

describe("applyEvidence (loop step 4 as a pure transition)", () => {
  it("updates exactly the evidenced concepts and marks them dirty", () => {
    const states = seededStates();
    const r = applyEvidence({ states, analysis: partialAnalysis, question: OPENING_QUESTION, confidence: "CONFIDENT", conceptName });
    expect(r.deltas.map((d) => d.conceptId).sort()).toEqual(["search_space_reduction", "sorted_arrays"]);
    expect(r.dirty.has("sorted_arrays")).toBe(true);
    expect(r.dirty.has("arrays")).toBe(false); // untouched concepts never persisted
  });

  it("records before/after so the UI can render true deltas", () => {
    const states = seededStates();
    const r = applyEvidence({ states, analysis: partialAnalysis, question: OPENING_QUESTION, confidence: "CONFIDENT", conceptName });
    const ssr = r.deltas.find((d) => d.conceptId === "search_space_reduction")!;
    expect(ssr.before).toBeCloseTo(0.28);
    expect(ssr.after).toBeLessThan(ssr.before); // ABSENT + confident -> mastery drops
  });

  it("attaches the detected misconception to its taxonomy target concept", () => {
    const states = seededStates();
    const r = applyEvidence({ states, analysis: partialAnalysis, question: OPENING_QUESTION, confidence: "CONFIDENT", conceptName });
    expect(r.misconceptionEvents).toEqual([
      expect.objectContaining({ conceptId: "search_space_reduction", event: "DETECTED" }),
    ]);
    expect(states.get("search_space_reduction")!.status).toBe("MISCONCEPTION_DETECTED");
  });

  it("moves a targeted misconception to RESOLVING on a clean, on-target answer", () => {
    const states = seededStates();
    const ssr = states.get("search_space_reduction")!;
    ssr.misconceptionScore = 0.7;
    ssr.misconceptionId = "SPEED_WITHOUT_MECHANISM";
    const cleanAnalysis: AnalysisResult = {
      ...partialAnalysis,
      concept_evidence: [{ concept_id: "search_space_reduction", finding: "PRESENT" }],
      misconception: "NONE",
    };
    const r = applyEvidence({
      states,
      analysis: cleanAnalysis,
      question: { ...OPENING_QUESTION, targetsMisconceptionId: "SPEED_WITHOUT_MECHANISM" },
      confidence: "CONFIDENT",
      conceptName,
    });
    expect(r.misconceptionEvents).toEqual([
      expect.objectContaining({ conceptId: "search_space_reduction", event: "RESOLVING" }),
    ]);
    expect(states.get("search_space_reduction")!.resolvingCount).toBe(1);
  });
});
