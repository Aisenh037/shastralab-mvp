import { NextResponse } from "next/server";
import { resetLearner, LEARNER_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Resets THIS visitor's session (deletes their learner clone; a fresh one is created on next load). */
export async function POST() {
  try {
    await resetLearner();
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(LEARNER_COOKIE);
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
