import { prisma } from "./db";
import { callGemini, MODEL } from "./gemini";
import { heuristicAnalysis } from "./fallback";
import {
  ALPHA,
  CORRECT_EVIDENCE_THRESHOLD,
  MAX_ANSWER_CHARS,
  MIN_ANSWER_CHARS,
} from "./engine/constants";
import { deriveCorrectness, evidenceScore } from "./engine/mastery";
import { findBottleneck } from "./engine/bottleneck";
import { selectStrategy } from "./engine/strategy";
import type {
  AnalysisResult,
  ConceptStateView,
  Confidence,
  EdgeRef,
  QuestionSpec,
} from "./engine/types";
import { applyEvidence } from "./turn/apply-evidence";
import { generateNextStep } from "./turn/generate";
import {
  compileAnalysisPrompt,
  compileGenerationPrompt,
  compileLearnerContext,
} from "./prompts/compiler";
import { analysisResponseSchema, analysisZod } from "./prompts/schemas";
import { CONCEPTS } from "./seed-data";

// ---------------------------------------------------------------------------
// The adaptive loop orchestrator. One call = one full turn:
// OBSERVE -> ANALYZE (Gemini A) -> VALIDATE -> UPDATE GRAPH -> BOTTLENECK ->
// STRATEGY -> COMPILE -> GENERATE (Gemini B) -> EMIT.
// Step 4 lives in turn/apply-evidence (pure state transition) and step 8 in
// turn/generate (call B + contract enforcement); this file owns sequencing,
// persistence, and the receipt trail.
// Invariants: the LLM never writes state (I1); every AI execution is logged
// before use (I2); INSUFFICIENT_EVIDENCE writes nothing (I3); graph writes are
// transactional (I4); the UI renders only fields of this payload (I5).
// ---------------------------------------------------------------------------

export interface Receipt {
  step: string;
  owner: "ENGINE" | "GEMINI" | "FALLBACK";
  ms: number;
  note: string;
  at: string;
}

const conceptName = new Map(CONCEPTS.map((c) => [c.id, c.name]));

function toView(s: {
  conceptId: string;
  mastery: number;
  misconceptionScore: number;
  misconceptionId: string | null;
  status: string;
  attempts: number;
  resolvingCount: number;
}): ConceptStateView {
  return { ...s, status: s.status as ConceptStateView["status"] };
}

export async function runTurn(learnerId: string, answer: string, confidence: Confidence) {
  const receipts: Receipt[] = [];
  const t0 = Date.now();
  const mark = (step: string, owner: Receipt["owner"], since: number, note: string) => {
    receipts.push({ step, owner, ms: Date.now() - since, note, at: new Date().toISOString() });
  };

  // ---- 1. OBSERVE -----------------------------------------------------------
  const tObserve = Date.now();
  const [learner, edgeRows] = await Promise.all([
    prisma.learner.findUnique({ where: { id: learnerId }, include: { states: true } }),
    prisma.conceptEdge.findMany(),
  ]);
  if (!learner || !learner.currentQuestion) throw new Error("LEARNER_NOT_FOUND");
  const question = learner.currentQuestion as unknown as QuestionSpec;
  const states = new Map(learner.states.map((s) => [s.conceptId, toView(s)]));
  const edges: EdgeRef[] = edgeRows.map((e) => ({
    fromId: e.fromId,
    toId: e.toId,
    type: e.type as EdgeRef["type"],
  }));

  const trimmed = answer.trim();
  if (trimmed.length > MAX_ANSWER_CHARS) throw new Error("ANSWER_TOO_LONG");
  if (trimmed.length < MIN_ANSWER_CHARS || !/[a-z]/i.test(trimmed)) {
    // Pre-filter: no LLM call, no state writes (invariant I3).
    mark("OBSERVE", "ENGINE", tObserve, "Pre-filter: answer too short or no prose - no LLM call, no state change");
    return {
      kind: "INSUFFICIENT_EVIDENCE" as const,
      message:
        "That answer does not contain enough reasoning to grade. Nothing was written to your knowledge graph - try expressing your thinking in a sentence or two.",
      receipts,
      question,
    };
  }
  mark("OBSERVE", "ENGINE", tObserve, `Answer received (${trimmed.length} chars, confidence ${confidence})`);

  // ---- 2-3. ANALYZE + VALIDATE (Gemini A) ------------------------------------
  const analysisPrompt = compileAnalysisPrompt(question, trimmed, confidence, states);
  const tAnalyze = Date.now();
  const analysisCall = await callGemini<AnalysisResult>({
    learnerId,
    promptType: "ANALYSIS",
    prompt: analysisPrompt.text,
    responseSchema: analysisResponseSchema(question.expectedConceptIds),
    zodSchema: analysisZod(question.expectedConceptIds),
    temperature: 0.1,
  });
  let analysis: AnalysisResult;
  let analysisSource: "GEMINI" | "FALLBACK";
  if (analysisCall.ok && analysisCall.data) {
    analysis = analysisCall.data;
    analysisSource = "GEMINI";
    mark("ANALYZE", "GEMINI", tAnalyze, `${MODEL} - rubric analysis (${analysisCall.outputTokens} tok)`);
    mark("VALIDATE", "ENGINE", Date.now(), "Zod schema validation passed");
  } else {
    analysis = heuristicAnalysis(question, trimmed);
    analysisSource = "FALLBACK";
    mark("ANALYZE", "FALLBACK", tAnalyze, `AI unavailable (${analysisCall.error ?? "unknown"}) - heuristic keyword scoring, no LLM`);
  }

  if (analysis.verdict === "INSUFFICIENT_EVIDENCE") {
    mark("UPDATE", "ENGINE", Date.now(), "Verdict INSUFFICIENT_EVIDENCE - zero graph writes (invariant I3)");
    return {
      kind: "INSUFFICIENT_EVIDENCE" as const,
      message:
        "The diagnostic engine could not find a gradeable claim in that answer. Your knowledge graph was not changed - try again with your actual reasoning.",
      analysis,
      analysisSource,
      compiledPrompts: { analysis: analysisPrompt },
      receipts,
      question,
    };
  }

  // ---- 4. UPDATE GRAPH (pure transition, then one transaction) ----------------
  const tUpdate = Date.now();
  const overallE = evidenceScore(analysis.concept_evidence);
  const correctness = deriveCorrectness(overallE);
  const overallAlpha = ALPHA[overallE >= CORRECT_EVIDENCE_THRESHOLD ? "correct" : "incorrect"][confidence];
  const { deltas, misconceptionEvents, dirty } = applyEvidence({
    states,
    analysis,
    question,
    confidence,
    conceptName,
  });

  await prisma.$transaction(
    [...states.values()]
      .filter((s) => dirty.has(s.conceptId))
      .map((s) =>
        prisma.learnerConceptState.update({
          where: { learnerId_conceptId: { learnerId, conceptId: s.conceptId } },
          data: {
            mastery: s.mastery,
            misconceptionScore: s.misconceptionScore,
            misconceptionId: s.misconceptionId,
            status: s.status,
            attempts: s.attempts,
            resolvingCount: s.resolvingCount,
          },
        }),
      ),
  );
  mark("UPDATE", "ENGINE", tUpdate, `${dirty.size} states written, ${misconceptionEvents.length} misconception events - deterministic, no LLM`);

  // ---- 5. BOTTLENECK ----------------------------------------------------------
  const tBottleneck = Date.now();
  const bottleneck = findBottleneck(edges, states, learner.topicId, learner.bottleneckId, conceptName);
  mark("BOTTLENECK", "ENGINE", tBottleneck, bottleneck.reason);

  // ---- 6. STRATEGY --------------------------------------------------------------
  const tStrategy = Date.now();
  const strategy = selectStrategy(states, bottleneck, learner.topicId, conceptName);
  mark("STRATEGY", "ENGINE", tStrategy, `${strategy.strategy} -> ${conceptName.get(strategy.targetConceptId)}`);

  // ---- 7. COMPILE ----------------------------------------------------------------
  const tCompile = Date.now();
  const context = compileLearnerContext(learnerId, learner.topicId, states, bottleneck.conceptId, strategy.strategy);
  const calibrationNote = `Self-reported ${confidence}, scored ${correctness} -> update weight alpha=${overallAlpha}`;
  const targetMastery = states.get(strategy.targetConceptId)?.mastery ?? 0;
  const difficulty = targetMastery < 0.35 ? "INTRO" : targetMastery < 0.7 ? "CORE" : "APPLIED";
  const generationPrompt = compileGenerationPrompt(context, strategy, analysis.evidence_quote, calibrationNote, difficulty);
  mark("COMPILE", "ENGINE", tCompile, "Adaptive prompt compiled from graph state");

  // ---- 8. GENERATE (Gemini B: merged intervention + next question) ---------------
  const tGenerate = Date.now();
  const generation = await generateNextStep({
    learnerId,
    promptText: generationPrompt.text,
    strategy,
    topicId: learner.topicId,
  });
  mark("GENERATE", generation.owner, tGenerate, generation.note);

  // ---- 9. EMIT --------------------------------------------------------------------
  const [, , totals] = await Promise.all([
    prisma.learner.update({
      where: { id: learnerId },
      data: { currentQuestion: generation.nextQuestion as object, bottleneckId: bottleneck.conceptId },
    }),
    prisma.learningEvent.create({
      data: {
        learnerId,
        kind: "TURN",
        payload: { answer: trimmed, confidence, analysis, deltas, misconceptionEvents, strategy, correctness } as object,
      },
    }),
    prisma.promptExecutionLog.aggregate({
      where: { learnerId, source: "GEMINI", ok: true },
      _count: { _all: true },
      _sum: { latencyMs: true, outputTokens: true },
    }),
  ]);
  mark("EMIT", "ENGINE", Date.now(), "Learner state persisted; Lab Report totals refreshed");

  return {
    kind: "TURN" as const,
    analysis,
    analysisSource,
    analysisMeta: { latencyMs: analysisCall.latencyMs, outputTokens: analysisCall.outputTokens, model: MODEL },
    correctness,
    calibration: { confidence, correctness, alpha: overallAlpha },
    graphDelta: deltas,
    misconceptionEvents,
    bottleneck,
    strategy,
    reasoningContext: context,
    compiledPrompts: { analysis: analysisPrompt, generation: generationPrompt },
    intervention: generation.intervention,
    interventionMeta: generation.meta,
    nextQuestion: generation.nextQuestion,
    receipts,
    labTotals: {
      geminiCalls: totals._count._all,
      totalLatencyMs: totals._sum.latencyMs ?? 0,
      totalTokens: totals._sum.outputTokens ?? 0,
    },
    turnMs: Date.now() - t0,
  };
}
