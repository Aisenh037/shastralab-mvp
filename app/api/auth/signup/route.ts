import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AUTH_COOKIE, SESSION_COOKIE_OPTS, hashPassword, isValidEmail, issueToken } from "@/lib/auth";
import { rateLimited } from "@/lib/ratelimit";
import { LEARNER_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (rateLimited(req, "signup")) {
    return NextResponse.json({ error: "Too many attempts - please wait a minute." }, { status: 429 });
  }
  let body: { email?: string; name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim().slice(0, 60);
  const password = body.password ?? "";

  if (!isValidEmail(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (password.length < 8 || password.length > 72) {
    return NextResponse.json({ error: "Password must be 8-72 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "An account with this email already exists - log in instead." }, { status: 409 });

  const user = await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password) },
  });

  const res = NextResponse.json({ ok: true, user: { email: user.email, name: user.name } });
  res.cookies.set(AUTH_COOKIE, issueToken(user.id), SESSION_COOKIE_OPTS);
  // Drop any guest learner cookie; the account gets its own learner clone.
  res.cookies.delete(LEARNER_COOKIE);
  return res;
}
