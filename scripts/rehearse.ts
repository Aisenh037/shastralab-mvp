/**
 * Rehearsal harness: fires the scripted demo answers at the REAL analysis
 * pipeline N times and prints the verdict distribution. Tune the analysis
 * prompt until both land in their intended bucket >90% of runs.
 *
 * Run: npx tsx scripts/rehearse.ts [runsPerCase]
 * Rate-limit aware: ~7s between calls fits free-tier 10 RPM.
 */
import { compileAnalysisPrompt } from "../lib/prompts/compiler";
import { analysisResponseSchema, analysisZod } from "../lib/prompts/schemas";
import { callGemini } from "../lib/gemini";
import { evidenceScore, deriveCorrectness, deriveStatus } from "../lib/engine/mastery";
import type { AnalysisResult, ConceptStateView, QuestionSpec } from "../lib/engine/types";
import { OPENING_QUESTION, QUESTION_BANK, TEMPLATE_STATES } from "../lib/seed-data";

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

interface Case {
  label: string;
  question: QuestionSpec;
  answer: string;
  expect: { correctness: string; misconception: string };
}

const CASES: Case[] = [
  {
    label: "demo turn 1 (shallow answer)",
    question: OPENING_QUESTION,
    answer: "Because the array is in order, so searching gets much faster.",
    expect: { correctness: "PARTIAL", misconception: "SPEED_WITHOUT_MECHANISM" },
  },
  {
    label: "demo turn 2 (correct answer)",
    question: { ...QUESTION_BANK.search_space_reduction, targetsMisconceptionId: "SPEED_WITHOUT_MECHANISM" },
    answer:
      "We discard the right half and keep searching the left half. That is safe because sorted order guarantees the target cannot be in the half we eliminated.",
    expect: { correctness: "CORRECT", misconception: "NONE" },
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const runs = Number(process.argv[2] ?? 5);
  for (const c of CASES) {
    const tally: Record<string, number> = {};
    console.log(`\n=== ${c.label} (${runs} runs) ===\nexpect: ${c.expect.correctness} + ${c.expect.misconception}`);
    for (let i = 0; i < runs; i++) {
      const prompt = compileAnalysisPrompt(c.question, c.answer, "CONFIDENT", states);
      const res = await callGemini<AnalysisResult>({
        learnerId: "rehearsal",
        promptType: "ANALYSIS",
        prompt: prompt.text,
        responseSchema: analysisResponseSchema(c.question.expectedConceptIds),
        zodSchema: analysisZod(c.question.expectedConceptIds) as never,
        temperature: 0.1,
      });
      if (!res.ok || !res.data) {
        tally[`ERROR:${res.error}`] = (tally[`ERROR:${res.error}`] ?? 0) + 1;
      } else {
        const correctness = deriveCorrectness(evidenceScore(res.data.concept_evidence));
        const key = `${correctness} + ${res.data.misconception}`;
        tally[key] = (tally[key] ?? 0) + 1;
        process.stdout.write(`  run ${i + 1}: ${key} (${res.latencyMs}ms)\n`);
      }
      if (i < runs - 1) await sleep(7000);
    }
    const want = `${c.expect.correctness} + ${c.expect.misconception}`;
    const hit = tally[want] ?? 0;
    console.log(`stability: ${hit}/${runs} (${Math.round((hit / runs) * 100)}%)`, tally);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
