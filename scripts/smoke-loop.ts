import { PrismaClient } from "@prisma/client";
import { runTurn } from "../lib/loop";

const prisma = new PrismaClient();

async function main() {
  const template = await prisma.learner.findFirstOrThrow({ where: { isTemplate: true }, include: { states: true } });
  const learner = await prisma.learner.create({
    data: {
      name: "SmokeTest", topicId: template.topicId,
      currentQuestion: template.currentQuestion as object,
      states: { create: template.states.map((s) => ({
        conceptId: s.conceptId, mastery: s.mastery, misconceptionScore: s.misconceptionScore,
        misconceptionId: s.misconceptionId, status: s.status, attempts: s.attempts, resolvingCount: s.resolvingCount,
      })) },
    },
  });
  console.log("=== TURN 0: gibberish (expect INSUFFICIENT_EVIDENCE, no LLM, no writes) ===");
  const t0 = await runTurn(learner.id, "asdfghjkl", "CONFIDENT");
  console.log(t0.kind, "|", t0.receipts.map((r) => `${r.step}:${r.owner}`).join(" "));

  console.log("\n=== TURN 1: shallow answer (expect PARTIAL + SPEED_WITHOUT_MECHANISM) ===");
  const t1 = await runTurn(learner.id, "Because the array is in order, so searching gets much faster.", "CONFIDENT");
  if (t1.kind !== "TURN") throw new Error("turn1 failed: " + JSON.stringify(t1));
  console.log("correctness:", t1.correctness, "| misconception:", t1.analysis.misconception);
  console.log("deltas:", t1.graphDelta.map((d) => `${d.conceptId} ${d.before.toFixed(2)}->${d.after.toFixed(2)} (α${d.alpha})`).join(", "));
  console.log("misconceptionEvents:", JSON.stringify(t1.misconceptionEvents));
  console.log("bottleneck:", t1.bottleneck.conceptId, "| decoy:", t1.bottleneck.decoy?.conceptId);
  console.log("strategy:", t1.strategy.strategy, "->", t1.strategy.targetConceptId);
  console.log("intervention source:", t1.intervention.source, "| words:", t1.intervention.text.split(/\s+/).length);
  console.log("nextQ target:", t1.nextQuestion.targetConceptId, "| targetsMisconception:", t1.nextQuestion.targetsMisconceptionId);
  console.log("timeline:", t1.receipts.map((r) => `${r.step}:${r.owner}:${r.ms}ms`).join(" "));

  console.log("\n=== TURN 2: correct answer to generated question (expect RESOLVING) ===");
  const t2 = await runTurn(
    learner.id,
    "We discard the right half and keep searching the left half. That is safe because sorted order guarantees the target cannot be in the half we eliminated.",
    "CONFIDENT",
  );
  if (t2.kind !== "TURN") throw new Error("turn2 failed");
  console.log("correctness:", t2.correctness, "| misconception:", t2.analysis.misconception);
  console.log("misconceptionEvents:", JSON.stringify(t2.misconceptionEvents));
  console.log("deltas:", t2.graphDelta.map((d) => `${d.conceptId} ${d.before.toFixed(2)}->${d.after.toFixed(2)}`).join(", "));
  console.log("strategy:", t2.strategy.strategy, "->", t2.strategy.targetConceptId);
  console.log("labTotals:", JSON.stringify(t2.labTotals));

  await prisma.learner.delete({ where: { id: learner.id } });
  console.log("\nsmoke-loop: PASSED (test learner cleaned up)");
}
main().catch((e) => { console.error(e); process.exit(1); });
