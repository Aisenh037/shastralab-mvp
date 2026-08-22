import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";
import { LEARNER_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  res.cookies.delete(LEARNER_COOKIE);
  return res;
}
