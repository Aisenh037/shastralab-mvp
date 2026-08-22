# DECISIONS.md — deliberate deviations & resolved ambiguities

1. **2 Gemini calls per turn, not 3.** Intervention + next-question are merged into one structured call (shared compiled context) — halves latency and quota; the intervention can also reference the question it just wrote.
2. **The LLM emits enums, never numbers.** All scores (correctness, mastery deltas, misconception score) are computed by the deterministic engine from rubric enums. Free floats are where LLM noise concentrates; enums are stable across runs.
3. **Model env-swappable, thinking capped.** `GEMINI_MODEL` is one env var (we switched 2.5-flash → 3.6-flash mid-build when the API retired the old id for new users — zero code change, which is the point). `thinkingLevel: LOW` keeps analysis latency demo-friendly.
4. **6 Prisma models, not 13.** `Learner, Concept, ConceptEdge, LearnerConceptState, LearningEvent, PromptExecutionLog`. Events fold the AI evaluation in as Json; the execution log is first-class because it is the judge-facing proof of real AI.
5. **Per-visitor sessions.** Each browser clones the seeded template learner (cookie-keyed). Evaluators never share state; Reset session is self-service. No auth by design — nothing to gate for a hackathon evaluation.
6. **One right answer never clears a misconception.** Detected → (targeted correct) → RESOLVING 1-of-2 → cleared on the second confirmation. Converts the "resolved after one data point?" objection into a feature.
7. **Bottleneck ≠ lowest score.** Only `PREREQUISITE_OF` edges route the root-cause search; the seed deliberately makes a non-prerequisite concept (Time Complexity) the numerically lowest so the traversal provably does something. Sticky pick prevents flapping.
8. **Fallbacks are loud, never fake.** AI-unavailable → deterministic keyword scoring labeled "no LLM call"; no intervention prose is ever fabricated (a curriculum-bank question is served, labeled as authored). The no-fake-AI rule is enforced structurally, not by promise.
9. **"Recency" dropped from the mastery formula** — the append-only LearningEvent stream is the recency story; adding a decay term bought nothing demoable.
10. **No test framework.** `npm run check` is a plain-assert script covering the four rules that could silently embarrass us live (bottleneck selection, calibration asymmetry, delta cap, lifecycle). Testing is low-weight in the rubric; the engine is small and pure.
11. **No graph library.** 7 hand-positioned SVG nodes with CSS transitions beat a physics layout for legibility and build time.
12. **Screen-1 contradiction resolved:** the demo deep-links into the seeded returning-learner session; the start card exists only as a front door for evaluators clicking the raw URL.
