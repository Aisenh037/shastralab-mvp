import { cookies } from "next/headers";
import { prisma } from "./db";
import { currentUser } from "./auth";

export const LEARNER_COOKIE = "sl_learner";

async function cloneFromTemplate(name: string, userId: string | null) {
  const template = await prisma.learner.findFirst({
    where: { isTemplate: true },
    include: { states: true },
  });
  if (!template) throw new Error("TEMPLATE_MISSING: run `npm run demo:reset` to seed the database");

  return prisma.learner.create({
    data: {
      name,
      userId,
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
      events: { create: { kind: "SESSION_START", payload: { clonedFrom: template.id, userId } } },
    },
  });
}

/**
 * Resolves the learner for this request.
 * Logged in  -> the account's learner (cloned from the seeded template on first login).
 * Guest      -> a cookie-keyed private clone, so concurrent evaluators never share state.
 */
export async function getOrCreateLearner(): Promise<{
  learnerId: string;
  created: boolean;
  user: { email: string; name: string } | null;
}> {
  const user = await currentUser();
  if (user) {
    const existing = await prisma.learner.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (existing) return { learnerId: existing.id, created: false, user };
    const learner = await cloneFromTemplate(user.name, user.id);
    return { learnerId: learner.id, created: false, user }; // no guest cookie needed
  }

  const store = await cookies();
  const existingId = store.get(LEARNER_COOKIE)?.value;
  if (existingId) {
    const found = await prisma.learner.findUnique({ where: { id: existingId }, select: { id: true, userId: true } });
    if (found && !found.userId) return { learnerId: found.id, created: false, user: null };
  }
  const learner = await cloneFromTemplate("Alex (guest)", null);
  return { learnerId: learner.id, created: true, user: null };
}

/**
 * Resets the CURRENT visitor's learner (guest clone or the account's learner).
 * Accounts survive a reset - only the learner model is re-cloned fresh.
 */
export async function resetLearner(): Promise<void> {
  const user = await currentUser();
  if (user) {
    await prisma.learner.deleteMany({ where: { userId: user.id, isTemplate: false } });
    return;
  }
  const store = await cookies();
  const id = store.get(LEARNER_COOKIE)?.value;
  if (id) {
    await prisma.learner.deleteMany({ where: { id, isTemplate: false, userId: null } });
  }
}
