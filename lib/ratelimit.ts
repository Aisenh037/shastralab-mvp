// Minimal in-memory rate limiter for the auth endpoints (credential-stuffing
// guard). Per-serverless-instance by design - a shared store (Upstash/Redis)
// is the production upgrade; for this deployment scale it meaningfully raises
// the cost of brute-forcing without adding infrastructure.

const hits = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

export function rateLimited(req: Request, bucket: string): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (hits.size > 5000) hits.clear(); // unbounded-growth guard
  return entry.count > MAX_PER_WINDOW;
}
