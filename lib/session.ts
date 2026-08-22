import { cookies } from "next/headers";
import { prisma } from "./db";

export const LEARNER_COOKIE = "sl_learner";

/**
 * Per-visitor sessions: every browser gets its own clone of the seeded "Alex"
 * template, so concurrent evaluators never share (or dirty) a knowledge graph.
 * Returns the learner id and whether a new clone was created (the caller sets
 * the cookie on its response when created=true).
 */
export async function getOrCreateLearner(): Promise<{ learnerId: string; created: boolean }> {
  const store = await cookies();
  const existingId = store.get(LEARNER_COOKIE)?.value;
  if (existingId) {
    const found = await prisma.learner.findUnique({ where: { id: existingId }, select: { id: true } });
    if (found) return { learnerId: found.id, created: false };
  }

  const template = await prisma.learner.findFirst({
    where: { isTemplate: true },
    include: { states: true },
  });
  if (!template) throw new Error("TEMPLATE_MISSING: run `npm run demo:reset` to seed the database");

  const learner = await prisma.learner.create({
    data: {
      name: "Alex",
      topicId: template.topicId,
      currentQuestion: template.currentQuestion as object,
      states: {
        create: template.states.map((s) => ({
          conceptId: s.conceptId,
          mastery: s.mastery,
          misconceptionScore: s.misconceptionScore,
          misconceptionId: s.misconceptionId,
          status: s.status,
          attempts: s.attempts,
          resolvingCount: s.resolvingCount,
        })),
      },
      events: { create: { kind: "SESSION_START", payload: { clonedFrom: template.id } } },
    },
  });
  return { learnerId: learner.id, created: true };
}

/** Deletes the visitor's learner row; the next state fetch clones a fresh one. */
export async function resetLearner(): Promise<void> {
  const store = await cookies();
  const id = store.get(LEARNER_COOKIE)?.value;
  if (id) {
    await prisma.learner.deleteMany({ where: { id, isTemplate: false } });
  }
}
