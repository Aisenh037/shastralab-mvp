import { beforeEach, describe, expect, it } from "vitest";
import { findBottleneck } from "../lib/engine/bottleneck";
import { applyMisconception } from "../lib/engine/misconception";
import { deriveCorrectness, deriveStatus, evidenceScore, updateMastery } from "../lib/engine/mastery";
import { selectStrategy } from "../lib/engine/strategy";
import type { ConceptStateView, EdgeRef } from "../lib/engine/types";
import { CONCEPTS, EDGES, TEMPLATE_STATES, TOPIC_ID } from "../lib/seed-data";

const names = new Map(CONCEPTS.map((c) => [c.id, c.name]));
const edges: EdgeRef[] = EDGES.map((e) => ({ ...e }));

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

describe("root-cause (bottleneck) search", () => {
  let states: Map<string, ConceptStateView>;
  beforeEach(() => {
    states = seededStates();
  });

  it("picks the weakest concept on the prerequisite path, not the lowest raw score", () => {
    const b = findBottleneck(edges, states, TOPIC_ID, null, names);
    expect(b.conceptId).toBe("search_space_reduction");
    // time_complexity scores lower but sits on a RELATED_TO edge - it must be the named decoy.
    expect(b.decoy?.conceptId).toBe("time_complexity");
    expect(b.reason).toContain("not a prerequisite");
  });

  it("returns the traversal path down to the topic", () => {
    const b = findBottleneck(edges, states, TOPIC_ID, null, names);
    expect(b.path).toEqual(["search_space_reduction", "binary_search"]);
  });

  it("is sticky: keeps the previous pick while it still qualifies (no flapping)", () => {
    const b = findBottleneck(edges, states, TOPIC_ID, "divide_and_conquer", names);
    expect(b.conceptId).toBe("divide_and_conquer");
  });

  it("reports no bottleneck when every prerequisite is strong", () => {
    for (const s of states.values()) s.mastery = 0.9;
    const b = findBottleneck(edges, states, TOPIC_ID, null, names);
    expect(b.conceptId).toBeNull();
  });
});

describe("mastery update + confidence calibration", () => {
  it("moves the model harder for confidently-wrong than for an honest guess", () => {
    const confident = updateMastery(0.5, 0, "CONFIDENT");
    const guessing = updateMastery(0.5, 0, "GUESSING");
    expect(Math.abs(confident.delta)).toBeGreaterThan(Math.abs(guessing.delta));
    expect(confident.alpha).toBe(0.45);
    expect(guessing.alpha).toBe(0.15);
  });

  it("caps a single turn's delta at 0.25 - one answer never teleports a bar", () => {
    const big = updateMastery(0.05, 1, "CONFIDENT");
    expect(big.delta).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("clamps mastery into [0, 1]", () => {
    expect(updateMastery(0.98, 1, "CONFIDENT").next).toBeLessThanOrEqual(1);
    expect(updateMastery(0.02, 0, "CONFIDENT").next).toBeGreaterThanOrEqual(0);
  });

  it("derives correctness labels from evidence thresholds", () => {
    expect(deriveCorrectness(0.8)).toBe("CORRECT");
    expect(deriveCorrectness(0.5)).toBe("PARTIAL");
    expect(deriveCorrectness(0.1)).toBe("INCORRECT");
  });

  it("averages rubric findings into an evidence score", () => {
    const e = evidenceScore([
      { concept_id: "a", finding: "PRESENT" },
      { concept_id: "b", finding: "ABSENT" },
    ]);
    expect(e).toBe(0.5);
  });
});

describe("misconception lifecycle", () => {
  it("detects at a 0.7 floor and never clears on a single correct answer", () => {
    let m = applyMisconception(0, 0, "DETECTED");
    expect(m.score).toBe(0.7);
    m = applyMisconception(m.score, m.resolvingCount, "TARGETED_CORRECT");
    expect(m.score).toBeLessThan(0.3);
    expect(m.cleared).toBe(false);
    expect(m.resolvingCount).toBe(1);
  });

  it("clears only on the second targeted confirmation", () => {
    let m = applyMisconception(0, 0, "DETECTED");
    m = applyMisconception(m.score, m.resolvingCount, "TARGETED_CORRECT");
    m = applyMisconception(m.score, m.resolvingCount, "TARGETED_CORRECT");
    expect(m.cleared).toBe(true);
  });

  it("re-confirmation raises the score toward 1", () => {
    const m = applyMisconception(0.7, 0, "RECONFIRMED");
    expect(m.score).toBeCloseTo(0.9);
  });
});

describe("strategy selection", () => {
  it("an active misconception outranks prerequisite remediation", () => {
    const states = seededStates();
    const b = findBottleneck(edges, states, TOPIC_ID, null, names);
    states.set("search_space_reduction", {
      ...states.get("search_space_reduction")!,
      misconceptionScore: 0.7,
      misconceptionId: "SPEED_WITHOUT_MECHANISM",
    });
    const s = selectStrategy(states, b, TOPIC_ID, names);
    expect(s.strategy).toBe("CONCEPTUAL_CORRECTION");
    expect(s.targetConceptId).toBe("search_space_reduction");
    expect(s.targetsMisconceptionId).toBe("SPEED_WITHOUT_MECHANISM");
  });

  it("falls back to prerequisite remediation for a weak upstream concept", () => {
    const states = seededStates();
    const b = findBottleneck(edges, states, TOPIC_ID, null, names);
    const s = selectStrategy(states, b, TOPIC_ID, names);
    expect(s.strategy).toBe("PREREQUISITE_REMEDIATION");
  });
});
