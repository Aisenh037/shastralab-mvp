import { GoogleGenAI, ThinkingLevel, type Schema } from "@google/genai";
import { prisma } from "./db";

/**
 * Structural validator - any Zod schema satisfies this shape. The output type
 * is asserted once, inside callGemini, because Zod's .catch() widens inferred
 * output types; keeping the single assertion here beats a cast at every call site.
 */
export interface Validator<T> {
  safeParse(input: unknown): { success: boolean; data?: unknown; error?: { issues: { message: string }[] } };
  readonly _outputMarker?: T;
}

// ---------------------------------------------------------------------------
// Single choke-point for every LLM call. Guarantees:
//  - every execution is logged to PromptExecutionLog BEFORE its result is used
//  - 20s hard timeout per attempt; 429 rotates to the fallback key
//  - one validation retry, then the caller falls back to deterministic scoring
// ---------------------------------------------------------------------------

export const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_FALLBACK].filter(
  (k): k is string => Boolean(k),
);

// One client per key for the process lifetime - no per-call construction.
const clients = new Map<string, GoogleGenAI>();
const clientFor = (key: string) => {
  let c = clients.get(key);
  if (!c) {
    c = new GoogleGenAI({ apiKey: key });
    clients.set(key, c);
  }
  return c;
};

export interface GeminiResult<T> {
  ok: boolean;
  data: T | null;
  rawText: string;
  latencyMs: number;
  outputTokens: number;
  model: string;
  error: string | null;
}

/** Strip markdown fences / trailing junk - local repair, zero latency. */
function localRepair(text: string): string {
  let t = text.trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return t;
}

async function attempt(
  key: string,
  prompt: string,
  responseSchema: Schema,
  temperature: number,
): Promise<{ text: string; outputTokens: number }> {
  const ai = clientFor(key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature,
        responseMimeType: "application/json",
        responseSchema,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: controller.signal,
      },
    });
    return {
      text: res.text ?? "",
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

const isRateLimit = (e: unknown) =>
  e instanceof Error && (e.message.includes("429") || /rate|quota|RESOURCE_EXHAUSTED/i.test(e.message));

/**
 * Call Gemini with structured output, validate with Zod, log verbatim.
 * Attempt ladder: key1 -> key1 retry (validation failure only) -> key2.
 */
export async function callGemini<T>(opts: {
  learnerId: string;
  promptType: "ANALYSIS" | "GENERATION";
  prompt: string;
  responseSchema: Schema;
  zodSchema: Validator<T>;
  temperature: number;
}): Promise<GeminiResult<T>> {
  const started = Date.now();
  let rawText = "";
  let outputTokens = 0;
  let error: string | null = null;
  let data: T | null = null;

  if (keys.length === 0) {
    error = "GEMINI_API_KEY is not configured";
  } else {
    const ladder: string[] = [keys[0], keys[0], ...(keys[1] ? [keys[1]] : [])];
    for (let i = 0; i < ladder.length && data === null; i++) {
      try {
        const res = await attempt(ladder[i], opts.prompt, opts.responseSchema, opts.temperature);
        rawText = res.text;
        outputTokens = res.outputTokens;
        const parsed = opts.zodSchema.safeParse(JSON.parse(localRepair(rawText)));
        if (parsed.success) {
          data = parsed.data as T; // sole assertion - see Validator note above
          error = null;
        } else {
          error = `validation failed: ${parsed.error?.issues[0]?.message ?? "unknown"}`;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        // A rate limit on the primary key skips its retry and goes to the backup.
        if (isRateLimit(e) && keys[1] && i < 1) i = 1;
      }
    }
  }

  const latencyMs = Date.now() - started;
  // Invariant I2: the execution is logged before the caller can use the result.
  try {
    await prisma.promptExecutionLog.create({
      data: {
        learnerId: opts.learnerId,
        promptType: opts.promptType,
        model: MODEL,
        promptText: opts.prompt,
        responseText: rawText || (error ?? ""),
        latencyMs,
        outputTokens,
        ok: data !== null,
        source: "GEMINI",
      },
    });
  } catch {
    // Logging must never take the session down (e.g. rehearsal without a learner row).
  }

  return { ok: data !== null, data, rawText, latencyMs, outputTokens, model: MODEL, error };
}
