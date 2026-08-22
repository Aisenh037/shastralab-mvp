import { MISCONCEPTIONS } from "../engine/constants";
import type {
  ConceptStateView,
  MisconceptionId,
  QuestionSpec,
} from "../engine/types";
import type { StrategyDecision } from "../engine/strategy";
import { CONCEPTS } from "../seed-data";
import {
  ANALYSIS_FEWSHOT,
  ANALYSIS_ROLE,
  GENERATION_ROLE,
  STRATEGY_DIRECTIVES,
  analysisRubricBlock,
  graphStateBlock,
  joinBlocks,
  learnerAnswerBlock,
  learnerContextBlock,
  objectiveBlock,
  type PromptBlock,
} from "./templates";

const conceptById = new Map(CONCEPTS.map((c) => [c.id, c]));
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * The structured learner context - what the UI shows under
 * "AI Reasoning Context" and what the generation prompt is compiled from.
 */
export interface LearnerContext {
  learnerId: string;
  currentTopic: string;
  masteryMap: Record<string, number>;
  strongConcepts: string[];
  weakConcepts: string[];
  activeMisconceptions: { id: string; label: string; conceptId: string; score: number }[];
  currentBottleneck: string | null;
  recommendedStrategy: string;
}

export function compileLearnerContext(
  learnerId: string,
  topicId: string,
  states: Map<string, ConceptStateView>,
  bottleneckId: string | null,
  strategy: string,
): LearnerContext {
  const masteryMap: Record<string, number> = {};
  const strong: string[] = [];
  const weak: string[] = [];
  const misconceptions: LearnerContext["activeMisconceptions"] = [];
  for (const [id, s] of states) {
    masteryMap[id] = s.mastery;
    const name = conceptById.get(id)?.name ?? id;
    if (s.attempts > 0 && s.mastery >= 0.65) strong.push(name);
    else if (s.attempts > 0 && s.mastery < 0.5) weak.push(name);
    if (s.misconceptionId && s.misconceptionScore > 0) {
      misconceptions.push({
        id: s.misconceptionId,
        label: MISCONCEPTIONS[s.misconceptionId as MisconceptionId]?.label ?? s.misconceptionId,
        conceptId: id,
        score: s.misconceptionScore,
      });
    }
  }
  return {
    learnerId,
    currentTopic: topicId,
    masteryMap,
    strongConcepts: strong,
    weakConcepts: weak,
    activeMisconceptions: misconceptions,
    currentBottleneck: bottleneckId,
    recommendedStrategy: strategy,
  };
}

function graphSummaryLines(states: Map<string, ConceptStateView>): string[] {
  return [...states.entries()].map(([id, s]) => {
    const name = conceptById.get(id)?.name ?? id;
    return `- ${name} (${id}): mastery ${pct(s.mastery)}, status ${s.status}`;
  });
}

export interface CompiledPrompt {
  text: string;
  blocks: PromptBlock[];
}

/** Call A: the analysis prompt, compiled from the question's own rubric + graph state. */
export function compileAnalysisPrompt(
  question: QuestionSpec,
  answer: string,
  confidence: string,
  states: Map<string, ConceptStateView>,
): CompiledPrompt {
  const expected = question.expectedConceptIds.map((id) => ({
    id,
    name: conceptById.get(id)?.name ?? id,
    rubricHint: conceptById.get(id)?.rubricHint ?? "demonstrates the concept",
  }));
  const blocks: PromptBlock[] = [
    ANALYSIS_ROLE,
    analysisRubricBlock(question.question, expected),
    ANALYSIS_FEWSHOT,
    graphStateBlock(graphSummaryLines(states)),
    learnerAnswerBlock(answer, confidence),
  ];
  return { text: joinBlocks(blocks), blocks };
}

/** Call B: the merged intervention + next-question prompt. */
export function compileGenerationPrompt(
  context: LearnerContext,
  strategy: StrategyDecision,
  evidenceQuote: string,
  calibrationNote: string,
  difficulty: string,
): CompiledPrompt {
  const mis = context.activeMisconceptions[0] ?? null;
  const blocks: PromptBlock[] = [
    GENERATION_ROLE,
    learnerContextBlock({
      strong: context.strongConcepts,
      weak: context.weakConcepts,
      misconceptionId: mis?.id ?? null,
      misconceptionLabel: mis?.label ?? null,
      evidenceQuote,
      calibrationNote,
    }),
    {
      label: "STRATEGY DIRECTIVE (selected deterministically by the engine)",
      text: `${strategy.strategy}: ${STRATEGY_DIRECTIVES[strategy.strategy] ?? "Provide a concise, learner-specific intervention."}`,
      fromGraph: true,
    },
    objectiveBlock(strategy.objective, strategy.targetConceptId, difficulty),
  ];
  return { text: joinBlocks(blocks), blocks };
}
