import { describe, expect, it } from "vitest";
import { heuristicAnalysis } from "../lib/fallback";
import { OPENING_QUESTION } from "../lib/seed-data";

describe("deterministic fallback scorer (AI-unavailable path)", () => {
  it("credits concepts backed by rubric keywords", () => {
    const r = heuristicAnalysis(
      OPENING_QUESTION,
      "comparing with the middle eliminates half of the remaining search space",
    );
    expect(r.verdict).toBe("GRADED");
    expect(r.concept_evidence.some((ev) => ev.finding === "PRESENT")).toBe(true);
  });

  it("does not credit unrelated prose", () => {
    const r = heuristicAnalysis(OPENING_QUESTION, "no relevant vocabulary here at all whatsoever");
    expect(r.concept_evidence.every((ev) => ev.finding === "ABSENT")).toBe(true);
  });

  it("never invents a misconception - honesty guarantee", () => {
    const r = heuristicAnalysis(OPENING_QUESTION, "binary search checks every element one by one");
    expect(r.misconception).toBe("NONE");
  });

  it("labels itself as heuristic in the reasoning summary", () => {
    const r = heuristicAnalysis(OPENING_QUESTION, "some answer text here");
    expect(r.reasoning_summary.toLowerCase()).toContain("heuristic");
  });
});
