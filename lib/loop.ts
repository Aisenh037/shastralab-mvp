import { prisma } from "./db";
import { callGemini, MODEL } from "./gemini";
import { heuristicAnalysis } from "./fallback";
import {
  ALPHA,
  CORRECT_EVIDENCE_THRESHOLD,
  MAX_ANSWER_CHARS,
  MIN_ANSWER_CHARS,
  MISCONCEPTIONS,
} from "./engine/constants";
import {
  deriveCorrectness,
  deriveStatus,
  evidenceScore,
  updateMastery,
} from "./engine/mastery";
import { applyMisconception } from "./engine/misconception";
import { findBottleneck } from "./engine/bottleneck";
import { selectStrategy } from "./engine/strategy";
import type {
  AnalysisResult,
  ConceptStateView,
  Confidence,
  EdgeRef,
  MisconceptionId,
  QuestionSpec,
} from "./engine/types";
import {
  compileAnalysisPrompt,
  compileGenerationPrompt,
  compileLearnerContext,
} from "./prompts/compiler";
import {
  analysisResponseSchema,
  analysisZod,
  generationResponseSchema,
  generationZod,
} from "./prompts/schemas";
import { CONCEPTS, QUESTION_BANK } from "./seed-data";

// ---------------------------------------------------------------------------
// The adaptive loop. One call = one full turn:
// OBSERVE -> ANALYZE (Gemini A) -> VALIDATE -> UPDATE GRAPH -> BOTTLENECK ->
// STRATEGY -> COMPILE -> GENERATE (Gemini B) -> EMIT.
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

const ALL_CONCEPT_IDS = CONCEPTS.map((c) => c.id);
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
  const hasLetters = /[a-z]/i.test(trimmed);
  if (trimmed.length < MIN_ANSWER_CHARS || !hasLetters) {
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

  // ---- 4. UPDATE GRAPH (deterministic, transactional) ------------------------
  const tUpdate = Date.now();
  const overallE = evidenceScore(analysis.concept_evidence);
  const correctness = deriveCorrectness(overallE);
  const band = overallE >= CORRECT_EVIDENCE_THRESHOLD ? "correct" : "incorrect";
  const overallAlpha = ALPHA[band][confidence];

  const originals = new Map(learner.states.map((s) => [s.conceptId, s.mastery]));
  const dirty = new Set<string>(); // only states actually touched get persisted
  const deltas: {
    conceptId: string;
    name: string;
    before: number;
    after: number;
    statusBefore: string;
    statusAfter: string;
    alpha: number;
    finding: string;
  }[] = [];
  const misconceptionEvents: { conceptId: string; event: string; label: string }[] = [];

  // Mastery updates from rubric evidence.
  for (const ev of analysis.concept_evidence) {
    const s = states.get(ev.concept_id);
    if (!s) continue;
    const e = ev.finding === "PRESENT" ? 1 : ev.finding === "MISAPPLIED" ? 0.25 : 0;
    const { next, alpha } = updateMastery(s.mastery, e, confidence);
    const statusBefore = s.status;
    s.mastery = next;
    s.attempts += 1;
    s.status = deriveStatus(next, s.misconceptionScore, s.attempts, s.resolvingCount);
    dirty.add(ev.concept_id);
    deltas.push({
      conceptId: ev.concept_id,
      name: conceptName.get(ev.concept_id) ?? ev.concept_id,
      before: originals.get(ev.concept_id) ?? next,
      after: next,
      statusBefore,
      statusAfter: s.status,
      alpha,
      finding: ev.finding,
    });
  }

  // Misconception lifecycle.
  if (analysis.misconception !== "NONE") {
    const mid = analysis.misconception as MisconceptionId;
    const target = MISCONCEPTIONS[mid]?.targetConceptId;
    const s = target ? states.get(target) : undefined;
    if (s) {
      const event = s.misconceptionId === mid && s.misconceptionScore > 0 ? "RECONFIRMED" : "DETECTED";
      const r = applyMisconception(s.misconceptionScore, s.resolvingCount, event);
      s.misconceptionScore = r.score;
      s.resolvingCount = r.resolvingCount;
      s.misconceptionId = mid;
      s.status = deriveStatus(s.mastery, s.misconceptionScore, s.attempts, s.resolvingCount);
      dirty.add(s.conceptId);
      misconceptionEvents.push({ conceptId: s.conceptId, event, label: MISCONCEPTIONS[mid].label });
    }
  } else if (question.targetsMisconceptionId) {
    // A question aimed at a misconception was answered without re-exhibiting it.
    const mid = question.targetsMisconceptionId as MisconceptionId;
    const target = MISCONCEPTIONS[mid]?.targetConceptId;
    const s = target ? states.get(target) : undefined;
    const targetEv = analysis.concept_evidence.find((ev) => ev.concept_id === target);
    const targetCorrect = targetEv?.finding === "PRESENT";
    if (s && s.misconceptionId === mid && s.misconceptionScore > 0 && targetCorrect) {
      const r = applyMisconception(s.misconceptionScore, s.resolvingCount, "TARGETED_CORRECT");
      s.misconceptionScore = r.score;
      s.resolvingCount = r.resolvingCount;
      if (r.cleared) s.misconceptionId = null;
      s.status = deriveStatus(s.mastery, s.misconceptionScore, s.attempts, s.resolvingCount);
      dirty.add(s.conceptId);
      misconceptionEvents.push({
        conceptId: s.conceptId,
        event: r.cleared ? "RESOLVED" : "RESOLVING",
        label: MISCONCEPTIONS[mid].label,
      });
    }
  }

  await prisma.$transaction(
    [...states.values()].filter((s) => dirty.has(s.conceptId)).map((s) =>
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
  const difficulty = (states.get(strategy.targetConceptId)?.mastery ?? 0) < 0.35 ? "INTRO" : (states.get(strategy.targetConceptId)?.mastery ?? 0) < 0.7 ? "CORE" : "APPLIED";
  const generationPrompt = compileGenerationPrompt(context, strategy, analysis.evidence_quote, calibrationNote, difficulty);
  mark("COMPILE", "ENGINE", tCompile, "Adaptive prompt compiled from graph state");

  // ---- 8. GENERATE (Gemini B: merged intervention + next question) ---------------
  const tGenerate = Date.now();
  type Generation = {
    intervention: { text: string; strategy_used: string; leverages: string[] };
    next_question: {
      question: string;
      target_concept: string;
      expected_concepts: string[];
      difficulty: "INTRO" | "CORE" | "APPLIED";
      why_this_question: string;
    };
  };
  let genCall = await callGemini<Generation>({
    learnerId,
    promptType: "GENERATION",
    prompt: generationPrompt.text,
    responseSchema: generationResponseSchema(ALL_CONCEPT_IDS),
    zodSchema: generationZod(ALL_CONCEPT_IDS),
    temperature: 0.3,
  });
  // Cross-call contract: the generated question must target the strategy's concept.
  if (genCall.ok && genCall.data && genCall.data.next_question.target_concept !== strategy.targetConceptId) {
    genCall = await callGemini<Generation>({
      learnerId,
      promptType: "GENERATION",
      prompt:
        generationPrompt.text +
        `\n\n## CORRECTION\nYour previous next_question targeted "${genCall.data.next_question.target_concept}". It MUST target "${strategy.targetConceptId}". Regenerate.`,
      responseSchema: generationResponseSchema(ALL_CONCEPT_IDS),
      zodSchema: generationZod(ALL_CONCEPT_IDS),
      temperature: 0.3,
    });
  }

  let intervention: { text: string; leverages: string[]; source: "GEMINI" | "UNAVAILABLE" };
  let nextQuestion: QuestionSpec;
  if (genCall.ok && genCall.data && genCall.data.next_question.target_concept === strategy.targetConceptId) {
    intervention = { text: genCall.data.intervention.text, leverages: genCall.data.intervention.leverages, source: "GEMINI" };
    nextQuestion = {
      question: genCall.data.next_question.question,
      targetConceptId: genCall.data.next_question.target_concept,
      expectedConceptIds: [...new Set(genCall.data.next_question.expected_concepts)],
      difficulty: genCall.data.next_question.difficulty,
      why: genCall.data.next_question.why_this_question,
      source: "GEMINI",
      targetsMisconceptionId: strategy.targetsMisconceptionId,
    };
    mark("GENERATE", "GEMINI", tGenerate, `${MODEL} - intervention + next question (${genCall.outputTokens} tok)`);
  } else {
    // Honest degradation: no AI prose is fabricated; an authored bank question serves.
    intervention = { text: "", leverages: [], source: "UNAVAILABLE" };
    nextQuestion = {
      ...(QUESTION_BANK[strategy.targetConceptId] ?? QUESTION_BANK[learner.topicId]),
      targetsMisconceptionId: strategy.targetsMisconceptionId,
    };
    mark("GENERATE", "FALLBACK", tGenerate, `AI unavailable (${genCall.error ?? "target mismatch"}) - authored curriculum-bank question served, no generated prose`);
  }

  // ---- 9. EMIT --------------------------------------------------------------------
  const [, , totals] = await Promise.all([
    prisma.learner.update({
      where: { id: learnerId },
      data: { currentQuestion: nextQuestion as object, bottleneckId: bottleneck.conceptId },
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
    intervention,
    interventionMeta: { latencyMs: genCall.latencyMs, outputTokens: genCall.outputTokens, model: MODEL },
    nextQuestion,
    receipts,
    labTotals: {
      geminiCalls: totals._count._all,
      totalLatencyMs: totals._sum.latencyMs ?? 0,
      totalTokens: totals._sum.outputTokens ?? 0,
    },
    turnMs: Date.now() - t0,
  };
}
