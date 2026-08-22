import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import { MISCONCEPTIONS } from "../engine/constants";

const MISCONCEPTION_IDS = Object.keys(MISCONCEPTIONS) as [string, ...string[]];
const MISCONCEPTION_ENUM = [...MISCONCEPTION_IDS, "NONE"] as [string, ...string[]];

// ---------------------------------------------------------------------------
// Two parallel schema definitions per call:
//  - a Gemini responseSchema (constrains generation shape + enums at the model)
//  - a Zod schema (server-side source of truth: clamps ranges, catches enum
//    drift; Gemini's structured output does NOT enforce numeric ranges).
// Enum-locking concept ids to the seeded graph means the model physically
// cannot name a concept or misconception outside the knowledge graph.
// ---------------------------------------------------------------------------

export function analysisResponseSchema(expectedConceptIds: string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      verdict: { type: Type.STRING, enum: ["GRADED", "INSUFFICIENT_EVIDENCE"] },
      concept_evidence: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            concept_id: { type: Type.STRING, enum: expectedConceptIds },
            finding: { type: Type.STRING, enum: ["PRESENT", "MISAPPLIED", "ABSENT"] },
          },
          required: ["concept_id", "finding"],
        },
      },
      misconception: { type: Type.STRING, enum: MISCONCEPTION_ENUM },
      evidence_quote: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
      reasoning_summary: { type: Type.STRING },
    },
    required: [
      "verdict",
      "concept_evidence",
      "misconception",
      "evidence_quote",
      "confidence",
      "reasoning_summary",
    ],
  };
}

export function analysisZod(expectedConceptIds: string[]) {
  const conceptEnum = z.enum(expectedConceptIds as [string, ...string[]]);
  return z.object({
    verdict: z.enum(["GRADED", "INSUFFICIENT_EVIDENCE"]).catch("INSUFFICIENT_EVIDENCE"),
    concept_evidence: z
      .array(
        z.object({
          concept_id: conceptEnum,
          finding: z.enum(["PRESENT", "MISAPPLIED", "ABSENT"]).catch("ABSENT"),
        }),
      )
      .catch([]),
    misconception: z.enum(MISCONCEPTION_ENUM).catch("NONE"),
    evidence_quote: z.string().catch(""),
    confidence: z
      .number()
      .transform((n) => Math.min(1, Math.max(0, n)))
      .catch(0.5),
    reasoning_summary: z.string().catch(""),
  });
}

export function generationResponseSchema(allConceptIds: string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      intervention: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          strategy_used: { type: Type.STRING },
          leverages: { type: Type.ARRAY, items: { type: Type.STRING, enum: allConceptIds } },
        },
        required: ["text", "strategy_used", "leverages"],
      },
      next_question: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          target_concept: { type: Type.STRING, enum: allConceptIds },
          expected_concepts: { type: Type.ARRAY, items: { type: Type.STRING, enum: allConceptIds } },
          difficulty: { type: Type.STRING, enum: ["INTRO", "CORE", "APPLIED"] },
          why_this_question: { type: Type.STRING },
        },
        required: ["question", "target_concept", "expected_concepts", "difficulty", "why_this_question"],
      },
    },
    required: ["intervention", "next_question"],
  };
}

export function generationZod(allConceptIds: string[]) {
  const conceptEnum = z.enum(allConceptIds as [string, ...string[]]);
  return z.object({
    intervention: z.object({
      text: z.string().min(1),
      strategy_used: z.string().catch(""),
      leverages: z.array(conceptEnum).catch([]),
    }),
    next_question: z.object({
      question: z.string().min(10),
      target_concept: conceptEnum,
      expected_concepts: z.array(conceptEnum).min(1),
      difficulty: z.enum(["INTRO", "CORE", "APPLIED"]).catch("CORE"),
      why_this_question: z.string().catch(""),
    }),
  });
}

export type AnalysisParsed = z.infer<ReturnType<typeof analysisZod>>;
export type GenerationParsed = z.infer<ReturnType<typeof generationZod>>;
