import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
async function probe(label: string, config: object) {
  const t = Date.now();
  try {
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL!,
      contents: "Return JSON: {\"x\": 1}",
      config: { responseMimeType: "application/json", maxOutputTokens: 200, ...config },
    });
    console.log(label, "OK", Date.now() - t + "ms", JSON.stringify(res.text).slice(0, 40));
  } catch (e) {
    console.log(label, "FAIL", Date.now() - t + "ms", (e as Error).message.slice(0, 120));
  }
}
async function main() {
  await probe("thinkingLevel:low", { thinkingConfig: { thinkingLevel: "low" as ThinkingLevel } });
  await probe("no-thinking-config", {});
}
main();
