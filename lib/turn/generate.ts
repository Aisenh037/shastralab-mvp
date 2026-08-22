import { callGemini, MODEL } from "../gemini";
import type { QuestionSpec } from "../engine/types";
import type { StrategyDecision } from "../engine/strategy";
import { generationResponseSchema, generationZod } from "../prompts/schemas";
import { CONCEPTS, QUESTION_BANK } from "../seed-data";

// Step 8 of the adaptive loop: the merged intervention + next-question call,
// including the cross-call contract (the generated question MUST target the
// strategy's concept) and the honest degradation path (an authored
// curriculum-bank question - never fabricated AI prose).

const ALL_CONCEPT_IDS = CONCEPTS.map((c) => c.id);

interface Generation {
  intervention: { text: string; strategy_used: string; leverages: string[] };
  next_question: {
    question: string;
    target_concept: string;
    expected_concepts: string[];
    difficulty: "INTRO" | "CORE" | "APPLIED";
    why_this_question: string;
  };
}

export interface GenerationOutcome {
  intervention: { text: string; leverages: string[]; source: "GEMINI" | "UNAVAILABLE" };
  nextQuestion: QuestionSpec;
  meta: { latencyMs: number; outputTokens: number; model: string };
  owner: "GEMINI" | "FALLBACK";
  note: string;
}

export async function generateNextStep(opts: {
  learnerId: string;
  promptText: string;
  strategy: StrategyDecision;
  topicId: string;
}): Promise<GenerationOutcome> {
  const { learnerId, promptText, strategy, topicId } = opts;

  let call = await callGemini<Generation>({
    learnerId,
    promptType: "GENERATION",
    prompt: promptText,
    responseSchema: generationResponseSchema(ALL_CONCEPT_IDS),
    zodSchema: generationZod(ALL_CONCEPT_IDS),
    temperature: 0.3,
  });

  // Cross-call contract: one corrective retry if the question targets the wrong concept.
  if (call.ok && call.data && call.data.next_question.target_concept !== strategy.targetConceptId) {
    call = await callGemini<Generation>({
      learnerId,
      promptType: "GENERATION",
      prompt:
        promptText +
        `\n\n## CORRECTION\nYour previous next_question targeted "${call.data.next_question.target_concept}". It MUST target "${strategy.targetConceptId}". Regenerate.`,
      responseSchema: generationResponseSchema(ALL_CONCEPT_IDS),
      zodSchema: generationZod(ALL_CONCEPT_IDS),
      temperature: 0.3,
    });
  }

  const meta = { latencyMs: call.latencyMs, outputTokens: call.outputTokens, model: MODEL };

  if (call.ok && call.data && call.data.next_question.target_concept === strategy.targetConceptId) {
    return {
      intervention: {
        text: call.data.intervention.text,
        leverages: call.data.intervention.leverages,
        source: "GEMINI",
      },
      nextQuestion: {
        question: call.data.next_question.question,
        targetConceptId: call.data.next_question.target_concept,
        expectedConceptIds: [...new Set(call.data.next_question.expected_concepts)],
        difficulty: call.data.next_question.difficulty,
        why: call.data.next_question.why_this_question,
        source: "GEMINI",
        targetsMisconceptionId: strategy.targetsMisconceptionId,
      },
      meta,
      owner: "GEMINI",
      note: `${MODEL} - intervention + next question (${call.outputTokens} tok)`,
    };
  }

  // Honest degradation: no AI prose is fabricated; an authored bank question serves.
  return {
    intervention: { text: "", leverages: [], source: "UNAVAILABLE" },
    nextQuestion: {
      ...(QUESTION_BANK[strategy.targetConceptId] ?? QUESTION_BANK[topicId]),
      targetsMisconceptionId: strategy.targetsMisconceptionId,
    },
    meta,
    owner: "FALLBACK",
    note: `AI unavailable (${call.error ?? "target mismatch"}) - authored curriculum-bank question served, no generated prose`,
  };
}
