import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AUTH_COOKIE, hashPassword, isValidEmail, issueToken } from "@/lib/auth";
import { LEARNER_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "An account with this email already exists - log in instead." }, { status: 409 });

  const user = await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password) },
  });

  const res = NextResponse.json({ ok: true, user: { email: user.email, name: user.name } });
  res.cookies.set(AUTH_COOKIE, issueToken(user.id), {
    httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/",
  });
  // Drop any guest learner cookie; the account gets its own learner clone.
  res.cookies.delete(LEARNER_COOKIE);
  return res;
}
