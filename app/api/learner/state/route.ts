import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateLearner, LEARNER_COOKIE } from "@/lib/session";
import { PATH_ORDER } from "@/lib/seed-data";

export const dynamic = "force-dynamic";

/** Full learner state for the UI: graph, states, current question, Lab Report totals. */
export async function GET() {
  try {
    const { learnerId, created } = await getOrCreateLearner();
    const [learner, concepts, edges, totals, recentLogs] = await Promise.all([
      prisma.learner.findUniqueOrThrow({ where: { id: learnerId }, include: { states: true } }),
      prisma.concept.findMany(),
      prisma.conceptEdge.findMany(),
      prisma.promptExecutionLog.aggregate({
        where: { learnerId, source: "GEMINI", ok: true },
        _count: { _all: true },
        _sum: { latencyMs: true, outputTokens: true },
      }),
      prisma.promptExecutionLog.findMany({
        where: { learnerId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { promptType: true, model: true, latencyMs: true, ok: true, source: true, createdAt: true },
      }),
    ]);

    const res = NextResponse.json({
      learnerId,
      name: learner.name,
      topicId: learner.topicId,
      bottleneckId: learner.bottleneckId,
      currentQuestion: learner.currentQuestion,
      states: learner.states,
      concepts,
      edges,
      pathOrder: PATH_ORDER,
      labTotals: {
        geminiCalls: totals._count._all,
        totalLatencyMs: totals._sum.latencyMs ?? 0,
        totalTokens: totals._sum.outputTokens ?? 0,
      },
      recentLogs,
    });
    if (created) {
      res.cookies.set(LEARNER_COOKIE, learnerId, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
    }
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    const status = message.startsWith("TEMPLATE_MISSING") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
