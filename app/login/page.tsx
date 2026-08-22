"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email, password } : { email, name, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong - please retry.");
      else router.push("/learn");
    } catch {
      setError("Network error - please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 shadow-sm">
        <Link href="/" className="font-mono text-xs tracking-[0.3em] text-muted hover:text-foreground">
          ← SHASTRALAB
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "login"
            ? "Your learner model picks up exactly where it left off."
            : "An account keeps your knowledge graph across devices."}
        </p>

        <div className="mt-5 flex gap-1 rounded-lg border border-line p-1" role="tablist">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 cursor-pointer rounded-md px-3 py-2 text-sm transition ${
                mode === m ? "bg-gemini text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === "signup" && (
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                autoComplete="name"
                className="w-full rounded-lg border border-line bg-panel-2 p-3 text-sm outline-none transition focus:border-gemini"
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-line bg-panel-2 p-3 text-sm outline-none transition focus:border-gemini"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Password {mode === "signup" && <em className="text-xs">(min 8 characters)</em>}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full rounded-lg border border-line bg-panel-2 p-3 text-sm outline-none transition focus:border-gemini"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-lg bg-gemini px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "One moment…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <div className="mt-5 border-t border-line pt-4 text-center text-xs text-muted">
          <p>
            Just evaluating?{" "}
            <Link href="/learn" className="text-gemini underline-offset-2 hover:underline">
              Continue as guest
            </Link>{" "}
            - no account needed.
          </p>
          <p className="mt-1 font-mono">test account: demo@shastralab.app / shastra123</p>
        </div>
      </div>
    </main>
  );
}
