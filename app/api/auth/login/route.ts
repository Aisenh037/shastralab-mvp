import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AUTH_COOKIE, SESSION_COOKIE_OPTS, checkPassword, issueToken } from "@/lib/auth";
import { rateLimited } from "@/lib/ratelimit";
import { LEARNER_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (rateLimited(req, "login")) {
    return NextResponse.json({ error: "Too many attempts - please wait a minute." }, { status: 429 });
  }
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await checkPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, user: { email: user.email, name: user.name } });
  res.cookies.set(AUTH_COOKIE, issueToken(user.id), SESSION_COOKIE_OPTS);
  res.cookies.delete(LEARNER_COOKIE);
  return res;
}
