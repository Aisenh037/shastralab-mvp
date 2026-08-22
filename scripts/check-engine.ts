/**
 * Plain-assert checks for the deterministic engine - no test framework.
 * Run: npm run check
 * These four properties are the ones that would silently embarrass us on
 * stage if wrong; everything else is visible in the UI.
 */
import assert from "node:assert";
import { findBottleneck } from "../lib/engine/bottleneck";
import { applyMisconception } from "../lib/engine/misconception";
import { deriveStatus, updateMastery } from "../lib/engine/mastery";
import { selectStrategy } from "../lib/engine/strategy";
import type { ConceptStateView, EdgeRef } from "../lib/engine/types";
import { CONCEPTS, EDGES, OPENING_QUESTION, TEMPLATE_STATES, TOPIC_ID } from "../lib/seed-data";
import { heuristicAnalysis } from "../lib/fallback";
import { issueToken, verifyToken } from "../lib/auth-token";

const names = new Map(CONCEPTS.map((c) => [c.id, c.name]));
const edges: EdgeRef[] = EDGES.map((e) => ({ ...e }));
const states = new Map<string, ConceptStateView>(
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

// 1. Bottleneck picks the prerequisite-path node, NOT the numerically lowest concept.
const b = findBottleneck(edges, states, TOPIC_ID, null, names);
assert.equal(b.conceptId, "search_space_reduction", "bottleneck must be search_space_reduction");
assert.equal(b.decoy?.conceptId, "time_complexity", "decoy must be time_complexity (lowest but RELATED_TO)");
assert.ok(b.reason.includes("not a prerequisite"), "reason must name the passed-over decoy");
assert.deepEqual(b.path, ["search_space_reduction", "binary_search"], "path must trace to the topic");

// 1b. Stickiness: a previously chosen bottleneck is kept while it still qualifies.
const sticky = findBottleneck(edges, states, TOPIC_ID, "divide_and_conquer", names);
assert.equal(sticky.conceptId, "divide_and_conquer", "sticky bottleneck must not flap");

// 2. Confidence calibration is asymmetric: confidently-wrong > guessing-wrong.
const wrongConfident = updateMastery(0.5, 0, "CONFIDENT");
const wrongGuessing = updateMastery(0.5, 0, "GUESSING");
assert.ok(Math.abs(wrongConfident.delta) > Math.abs(wrongGuessing.delta), "confidently-wrong must move mastery more");
assert.equal(wrongConfident.alpha, 0.45);
assert.equal(wrongGuessing.alpha, 0.15);
// Delta cap: one answer never teleports a bar.
const big = updateMastery(0.05, 1, "CONFIDENT");
assert.ok(big.delta <= 0.25 + 1e-9, "per-turn delta must be capped at 0.25");

// 3. Misconception lifecycle: one correct answer -> RESOLVING, never instant clear.
let m = applyMisconception(0, 0, "DETECTED");
assert.equal(m.score, 0.7);
m = applyMisconception(m.score, m.resolvingCount, "TARGETED_CORRECT");
assert.ok(m.score < 0.3 && !m.cleared, "first correction resolves score but does NOT clear");
assert.equal(m.resolvingCount, 1);
m = applyMisconception(m.score, m.resolvingCount, "TARGETED_CORRECT");
assert.ok(m.cleared, "second confirmation clears the misconception");

// 4. Strategy: an active misconception outranks prerequisite remediation.
const withMis = new Map(states);
withMis.set("search_space_reduction", {
  ...states.get("search_space_reduction")!,
  misconceptionScore: 0.7,
  misconceptionId: "SPEED_WITHOUT_MECHANISM",
});
const s1 = selectStrategy(withMis, b, TOPIC_ID, names);
assert.equal(s1.strategy, "CONCEPTUAL_CORRECTION");
assert.equal(s1.targetConceptId, "search_space_reduction");
const s2 = selectStrategy(states, b, TOPIC_ID, names);
assert.equal(s2.strategy, "PREREQUISITE_REMEDIATION", "weak prereq -> remediation when no misconception");

// 5. Fallback scorer is honest: keyword overlap grades, but never invents a misconception.
const fb = heuristicAnalysis(OPENING_QUESTION, "comparing with the middle eliminates half of the remaining search space");
assert.equal(fb.misconception, "NONE", "fallback must never diagnose misconceptions");
assert.ok(fb.concept_evidence.some((ev) => ev.finding === "PRESENT"), "fallback must credit keyword-backed concepts");
const fbBad = heuristicAnalysis(OPENING_QUESTION, "no relevant vocabulary here at all whatsoever");
assert.ok(fbBad.concept_evidence.every((ev) => ev.finding === "ABSENT"), "fallback must not credit unrelated prose");

// 6. Session tokens: roundtrip works, tampering and expiry are rejected.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "check-engine-secret";
const token = issueToken("user_123");
assert.equal(verifyToken(token), "user_123", "valid token must verify");
assert.equal(verifyToken(token.slice(0, -2) + "xx"), null, "tampered signature must fail");
assert.equal(verifyToken("user_456" + token.slice(8)), null, "swapped userId must fail");
assert.equal(verifyToken(token, Date.now() + 31 * 24 * 60 * 60 * 1000), null, "expired token must fail");
assert.equal(verifyToken(undefined), null, "missing token must fail");

console.log("check-engine: all assertions passed");
