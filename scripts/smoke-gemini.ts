import { compileAnalysisPrompt } from "../lib/prompts/compiler";
import { analysisResponseSchema, analysisZod } from "../lib/prompts/schemas";
import { callGemini } from "../lib/gemini";
import { deriveStatus } from "../lib/engine/mastery";
import type { AnalysisResult, ConceptStateView } from "../lib/engine/types";
import { OPENING_QUESTION, TEMPLATE_STATES } from "../lib/seed-data";

const states = new Map<string, ConceptStateView>(
  TEMPLATE_STATES.map((s) => [s.conceptId, {
    conceptId: s.conceptId, mastery: s.mastery, misconceptionScore: 0,
    misconceptionId: null, status: deriveStatus(s.mastery, 0, s.attempts, 0),
    attempts: s.attempts, resolvingCount: 0,
  }]),
);

async function main() {
  const prompt = compileAnalysisPrompt(
    OPENING_QUESTION,
    "Because the array is in order, so searching gets much faster.",
    "CONFIDENT",
    states,
  );
  const res = await callGemini<AnalysisResult>({
    learnerId: "smoke",
    promptType: "ANALYSIS",
    prompt: prompt.text,
    responseSchema: analysisResponseSchema(OPENING_QUESTION.expectedConceptIds),
    zodSchema: analysisZod(OPENING_QUESTION.expectedConceptIds),
    temperature: 0.1,
  });
  console.log("ok:", res.ok, "| latency:", res.latencyMs + "ms", "| tokens:", res.outputTokens, "| model:", res.model);
  if (res.error) console.log("error:", res.error);
  console.log(JSON.stringify(res.data, null, 1));
}
main();
