import { NextResponse } from "next/server";
import { runTurn } from "@/lib/loop";
import { getOrCreateLearner, LEARNER_COOKIE } from "@/lib/session";
import { MAX_ANSWER_CHARS } from "@/lib/engine/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One full adaptive-loop turn. Thin controller - all logic lives in lib/loop.ts. */
export async function POST(req: Request) {
  let body: { answer?: string; confidence?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const answer = typeof body.answer === "string" ? body.answer : "";
  const confidence = ["GUESSING", "SOMEWHAT", "CONFIDENT"].includes(body.confidence ?? "")
    ? (body.confidence as "GUESSING" | "SOMEWHAT" | "CONFIDENT")
    : "SOMEWHAT";

  if (!answer.trim()) {
    return NextResponse.json({ error: "Please enter an answer before continuing." }, { status: 400 });
  }
  if (answer.length > MAX_ANSWER_CHARS) {
    return NextResponse.json(
      { error: `Answers are capped at ${MAX_ANSWER_CHARS} characters.` },
      { status: 400 },
    );
  }

  try {
    const { learnerId, created } = await getOrCreateLearner();
    const result = await runTurn(learnerId, answer, confidence);
    const res = NextResponse.json(result);
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
    return NextResponse.json(
      { error: "The adaptive loop hit an unexpected error. Your answer was not lost - please retry.", detail: message },
      { status: 500 },
    );
  }
}
