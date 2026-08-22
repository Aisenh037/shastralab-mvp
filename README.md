# ShastraLab (शास्त्र + Lab)

**Diagnose first. Teach second.**

Every AI learning app generates more content. ShastraLab generates the scarce thing: a **diagnosis**. A knowledge graph tracks what the learner actually believes, a **prompt compiler** turns that graph into context-aware Gemini prompts, and an adaptive loop finds the **root cause (nidān)** blocking progress — then fixes exactly that.

Built for **PromptWars** (Google for Developers × H2S).

---

## Quickstart

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL (Postgres) + GEMINI_API_KEY
npm run demo:reset     # push schema + seed the demo learner
npm run dev            # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run check` | Plain-assert verification of the deterministic engine (bottleneck, calibration, misconception lifecycle) |
| `npm run rehearse` | Fires the scripted demo answers at the REAL analysis pipeline N times, prints verdict stability |
| `npm run demo:reset` | Full DB reset + reseed |

## For evaluators

- **No login.** Opening the app clones a private copy of the seeded learner ("Alex") for your browser — your testing never collides with anyone else's. **Reset session** (top right) gives you a fresh clone anytime.
- **Type anything.** Answers are graded by a live Gemini call against a per-question rubric. Try a good answer, a shallow one, and gibberish (`asdfghjkl`) — gibberish is classified `INSUFFICIENT_EVIDENCE` and provably writes **nothing** to the learner model.
- **Provenance chips on every panel:** `✦ GEMINI` = a real model call (with latency + token receipts); `⚙ ENGINE` = deterministic code, no LLM. If Gemini is ever unavailable, the fallback is **loudly labeled** — this system never fabricates AI output.
- **"AI reasoning context"** shows the exact compiled prompt sent to Gemini, with the blocks injected from your knowledge graph highlighted. Every execution is also logged verbatim (`PromptExecutionLog`) with model, latency and tokens — the **Lab report** card is computed from those logs.

## How it works — Prompt + Loop + Graph

```
learner answer
   │
   ▼
1 OBSERVE      ENGINE   pre-filter (gibberish → no LLM call, no writes)
2 ANALYZE      GEMINI   rubric analysis — enums only, schema-locked to graph concepts
3 VALIDATE     ENGINE   Zod owns validity (clamps, enum-drift catch, 1 retry)
4 UPDATE       ENGINE   asymmetric EMA per concept + misconception lifecycle (transactional)
5 BOTTLENECK   ENGINE   BFS over PREREQUISITE_OF edges → most upstream weak concept
6 STRATEGY     ENGINE   decision table → intervention type + target concept
7 COMPILE      ENGINE   adaptive prompt assembled from graph state (inspectable in UI)
8 GENERATE     GEMINI   merged intervention + next question (question ships its own rubric)
9 EMIT         ENGINE   state persisted, receipts returned
   │
   └── the generated question's rubric feeds the NEXT analysis → the loop closes
```

**Loop invariants** (asserted in code, visible in UI):

- **I1** — Gemini never writes state: enum evidence in, prose out. All numeric scores are computed by the backend from rubric enums.
- **I2** — no AI response is used before its `PromptExecutionLog` row exists.
- **I3** — `INSUFFICIENT_EVIDENCE` ⇒ zero graph writes (no hallucinated learner state).
- **I4** — graph writes are transactional, committed only after validation.
- **I5** — every AI-related pixel maps to a real payload field; no copy invents an outcome.

**The engine is deliberately legible:** every deterministic rule (α table, thresholds, lifecycle, bottleneck tie-breaks) lives in [`lib/engine/constants.ts`](lib/engine/constants.ts) — one screen of policy.

Key design choices:

- **Confidence calibration:** confidently-wrong (α=0.45) moves the learner model harder than an honest "I'm guessing" miss (α=0.15). Miscalibration is the stronger signal.
- **Root-cause over lowest-score:** the seeded graph makes *Time Complexity* the numerically lowest concept, but it sits on a `RELATED_TO` edge — the bottleneck search must (and does) pick *Search Space Reduction* on the prerequisite path instead, and names the passed-over decoy in its explanation.
- **Misconceptions are a closed taxonomy:** the analysis schema is enum-locked, so the model cannot invent a misconception or a concept outside the graph.
- **One right answer never "resolves" a misconception** — it moves to `RESOLVING (1 of 2)`; the follow-up challenge exists to confirm.

## Architecture

```
app/api/turn          → thin controller for the loop (lib/loop.ts = the 9 steps above)
app/api/learner/state → learner model + graph + Lab-report totals
app/api/demo/reset    → per-visitor session reset
lib/engine/           → pure deterministic engine (zero deps, unit-checked via npm run check)
lib/prompts/          → prompt compiler: typed blocks → compiled prompt (+ Zod/Gemini schemas)
lib/gemini.ts         → single LLM choke-point: structured output, 20s timeout, key rotation on 429, verbatim logging
lib/fallback.ts       → honest keyword scorer for AI-unavailable moments (labeled, never generates prose)
prisma/               → 6 models incl. PromptExecutionLog (the judge-facing proof)
```

Stack: Next.js 15 (App Router) · TypeScript · Tailwind · Prisma + Postgres (Neon) · Google Gemini (`@google/genai`, structured output, model env-swappable via `GEMINI_MODEL`).

## Challenge alignment

> *"Build an AI-powered learning system that understands a learner's evolving knowledge state and delivers a personalized learning experience."*

| Challenge phrase | Where it lives |
|---|---|
| understands the learner's knowledge state | per-learner knowledge graph with mastery, status, misconception score per concept |
| **evolving** | every answer runs the loop; the graph, bottleneck and strategy visibly change per turn |
| personalized experience | prompts are compiled from *this learner's* graph — inspectable in "AI reasoning context" |
| GenAI at the core | 2 structured Gemini calls per turn, all logged with receipts; UI distinguishes AI from engine everywhere |

## Beyond the hackathon

1. **Wedge:** Indian test-prep (JEE/NEET/UPSC) — institutes already sell "weakness analysis", but only at topic-accuracy level. Misconception-level root cause is the upgrade they can't build in-house.
2. **GTM:** teacher/institute-facing, B2B2C — "your batch's top 5 misconceptions this week."
3. **Product ladder:** this app → a **Diagnosis API** (POST learner responses, get root cause + intervention directive) → the **Misconception Atlas**: an aggregated, per-domain map of how humans misunderstand each subject, improving with every learner.
4. **Moat:** the model is rented; the learner graph is owned. The IP is the compiler + graph + taxonomy — the engine is model-agnostic (`GEMINI_MODEL` is one env var). The loop is stateless per turn and multi-tenant-ready (everything keys off `learnerId`).
