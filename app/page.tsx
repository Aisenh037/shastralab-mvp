import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-line bg-panel p-10">
        <p className="font-mono text-xs tracking-[0.3em] text-muted">
          शास्त्र + LAB
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Shastra<span className="text-gemini">Lab</span>
        </h1>
        <p className="mt-3 text-lg text-foreground/90">
          Diagnose first. Teach second.
        </p>
        <p className="mt-4 text-sm leading-6 text-muted">
          Every AI learning app generates more content. ShastraLab generates
          the scarce thing: a <span className="text-foreground">diagnosis</span>.
          A knowledge graph tracks what you actually believe, a prompt compiler
          turns that graph into context-aware Gemini prompts, and an adaptive
          loop finds the root cause (<span className="italic">nidān</span>)
          blocking your progress - then fixes exactly that.
        </p>
        <ul className="mt-5 space-y-1.5 text-sm text-muted">
          <li>
            <span className="text-engine">⚙ ENGINE</span> - deterministic graph
            updates, bottleneck search, strategy selection. No LLM touches state.
          </li>
          <li>
            <span className="text-gemini">✦ GEMINI</span> - reasoning analysis and
            personalized interventions, every call logged and inspectable.
          </li>
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/learn"
            className="inline-block rounded-lg bg-gemini px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Enter the lab -&gt;
          </Link>
          <Link
            href="/login"
            className="inline-block rounded-lg border border-line px-6 py-3 text-sm font-medium text-foreground transition hover:border-gemini/50 hover:text-gemini"
          >
            Log in / Sign up
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted">
          Demo session: Alex, resuming <span className="text-foreground">Binary Search</span>.
          Guests get a private copy of the learner model - an account keeps yours across devices.
          <span className="mt-1 block font-mono">test account: demo@shastralab.app / shastra123</span>
        </p>
      </div>
    </main>
  );
}
