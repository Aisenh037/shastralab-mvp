import { PrismaClient } from "@prisma/client";
import { CONCEPTS, EDGES, OPENING_QUESTION, TEMPLATE_STATES } from "../lib/seed-data";
import { deriveStatus } from "../lib/engine/mastery";

const prisma = new PrismaClient();

async function main() {
  for (const c of CONCEPTS) {
    await prisma.concept.upsert({
      where: { id: c.id },
      update: { name: c.name, graphX: c.graphX, graphY: c.graphY },
      create: { id: c.id, name: c.name, graphX: c.graphX, graphY: c.graphY },
    });
  }
  for (const e of EDGES) {
    await prisma.conceptEdge.upsert({
      where: { fromId_toId_type: e },
      update: {},
      create: e,
    });
  }

  const existing = await prisma.learner.findFirst({ where: { isTemplate: true } });
  const template =
    existing ??
    (await prisma.learner.create({
      data: {
        name: "Alex",
        isTemplate: true,
        currentQuestion: OPENING_QUESTION as object,
      },
    }));

  for (const s of TEMPLATE_STATES) {
    const status = deriveStatus(s.mastery, 0, s.attempts, 0);
    await prisma.learnerConceptState.upsert({
      where: {
        learnerId_conceptId: { learnerId: template.id, conceptId: s.conceptId },
      },
      update: {
        mastery: s.mastery,
        attempts: s.attempts,
        status,
        misconceptionScore: 0,
        misconceptionId: null,
        resolvingCount: 0,
      },
      create: { learnerId: template.id, ...s, status },
    });
  }
  console.log("Seeded concepts, edges, and template learner:", template.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
