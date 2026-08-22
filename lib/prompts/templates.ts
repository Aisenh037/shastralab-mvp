import { MISCONCEPTIONS } from "../engine/constants";
import type { MisconceptionId, StrategyId } from "../engine/types";

// ---------------------------------------------------------------------------
// Prompt blocks. Prompts are ASSEMBLED from typed blocks, never stored as one
// static string - the assembled text is persisted verbatim and rendered in the
// UI prompt panel, so the compiler itself is inspectable by judges.
// ---------------------------------------------------------------------------

export interface PromptBlock {
  label: string;
  text: string;
  /** Blocks whose content came from the knowledge graph are highlighted in the UI. */
  fromGraph?: boolean;
}

export const joinBlocks = (blocks: PromptBlock[]) =>
  blocks.map((b) => `## ${b.label}\n${b.text}`).join("\n\n");

const MISCONCEPTION_LIST = (Object.keys(MISCONCEPTIONS) as MisconceptionId[])
  .map((id) => `- ${id}: ${MISCONCEPTIONS[id].label}`)
  .join("\n");

export const ANALYSIS_ROLE: PromptBlock = {
  label: "ROLE",
  text: `You are the diagnostic engine of an adaptive learning system.
Your job is to analyze the learner's REASONING against a fixed rubric - not to grade vibes, not to teach, not to converse.
If the response is gibberish, empty of any claim, off-topic, or merely restates the question, return verdict INSUFFICIENT_EVIDENCE with an empty concept_evidence array and misconception NONE.
Return only JSON matching the schema. No markdown, no commentary.`,
};

export const ANALYSIS_FEWSHOT: PromptBlock = {
  label: "CALIBRATION EXAMPLE",
  text: `Question: "Why must the array be sorted for binary search?"
Learner answer: "Because when it is in order you can search it much quicker."
Correct classification: verdict=GRADED; sorted_arrays=PRESENT (credits the ordering); search_space_reduction=ABSENT (claims speed but never explains that half the candidates get eliminated); misconception=SPEED_WITHOUT_MECHANISM.
The rule this example teaches: naming SPEED without the ELIMINATION MECHANISM is never PRESENT for search_space_reduction.`,
};

export function analysisRubricBlock(
  question: string,
  expected: { id: string; name: string; rubricHint: string }[],
): PromptBlock {
  const lines = expected
    .map((c) => `- ${c.id} ("${c.name}"): PRESENT only if the answer ${c.rubricHint}`)
    .join("\n");
  return {
    label: "RUBRIC",
    text: `Question asked: "${question}"
Grade each expected concept as PRESENT (clearly demonstrated), MISAPPLIED (mentioned but used incorrectly), or ABSENT (not demonstrated):
${lines}

Known misconception taxonomy (pick at most one, else NONE):
${MISCONCEPTION_LIST}

If a misconception is chosen, copy the learner's exact words that show it into evidence_quote.`,
  };
}

export function graphStateBlock(summaryLines: string[]): PromptBlock {
  return {
    label: "LEARNER KNOWLEDGE STATE (from the knowledge graph)",
    text: summaryLines.join("\n"),
    fromGraph: true,
  };
}

export function learnerAnswerBlock(answer: string, confidence: string): PromptBlock {
  return {
    label: "LEARNER ANSWER",
    text: `Self-reported confidence: ${confidence}\nAnswer: "${answer}"`,
  };
}

// --- Generation (Call B: merged intervention + next question) ---------------

export const GENERATION_ROLE: PromptBlock = {
  label: "ROLE",
  text: `You are the intervention engine of an adaptive learning system.
The application has already decided WHAT kind of intervention is needed; you decide only HOW to express it.
Never give a generic textbook explanation. Build on what this learner already understands.
Do NOT reveal the answer to the question you generate.
Return only JSON matching the schema.`,
};

export const STRATEGY_DIRECTIVES: Partial<Record<StrategyId, string>> = {
  CONCEPTUAL_CORRECTION: `Directly challenge the detected misconception - name what the learner got wrong and show why it breaks.
Anchor the explanation in a dictionary-lookup analogy (opening a dictionary near the middle and discarding an entire half).
Maximum 120 words. End with one sentence that bridges toward the next question WITHOUT answering it.`,
  PREREQUISITE_REMEDIATION: `Rebuild the weak prerequisite concept from the concepts the learner is already strong in.
Do not mention the downstream topic until the final sentence. Maximum 120 words.`,
  GUIDED_HINT: `Give exactly one guiding hint that moves the learner one step deeper. Do not explain the full mechanism. Maximum 80 words.`,
  CHALLENGE_PROBLEM: `Briefly acknowledge what the learner has mastered (one sentence), then frame why the next question is a step up. Maximum 80 words.`,
};

export function learnerContextBlock(ctx: {
  strong: string[];
  weak: string[];
  misconceptionId: string | null;
  misconceptionLabel: string | null;
  evidenceQuote: string;
  calibrationNote: string;
}): PromptBlock {
  const lines = [
    `Strong concepts (leverage these - do NOT re-teach them): ${ctx.strong.join(", ") || "none"}`,
    `Weak concepts: ${ctx.weak.join(", ") || "none"}`,
  ];
  if (ctx.misconceptionId) {
    lines.push(`Detected misconception: ${ctx.misconceptionId} - ${ctx.misconceptionLabel}`);
    if (ctx.evidenceQuote) lines.push(`The learner's own words: "${ctx.evidenceQuote}"`);
  }
  if (ctx.calibrationNote) lines.push(`Calibration: ${ctx.calibrationNote}`);
  return { label: "LEARNER CONTEXT (compiled from the knowledge graph)", text: lines.join("\n"), fromGraph: true };
}

export function objectiveBlock(objective: string, targetConceptId: string, difficulty: string): PromptBlock {
  return {
    label: "OBJECTIVE",
    text: `${objective}
The next_question MUST have target_concept = "${targetConceptId}" and test exactly that concept at ${difficulty} difficulty.
List in expected_concepts every concept a fully correct answer would demonstrate (including "${targetConceptId}").`,
    fromGraph: true,
  };
}
