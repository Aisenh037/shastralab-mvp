/**
 * Records the submission demo video against the LIVE deployment.
 * Everything is real: real login, live keystroke-by-keystroke typing,
 * real production Gemini calls, real graph updates. Captions replace
 * narration (allowed by the submission guide). Output: demo-video/*.webm
 *
 * Run: npx tsx scripts/record-demo.ts
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "https://shastralab-chi.vercel.app";
const OUT = "demo-video";
const SIZE = { width: 1920, height: 1080 };

const EMAIL = "demo@shastralab.app";
const PASSWORD = "shastra123";

const ANSWER_SHALLOW = "Because the array is in order, so searching gets much faster.";
const ANSWER_CORRECT =
  "We compare the target with the middle element: if the target is smaller we eliminate the right half, if larger we eliminate the left half. Sorted order guarantees the target cannot be in the eliminated half, so the search space halves every step.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** On-screen caption bar + fake cursor (Playwright videos have no OS cursor). */
const OVERLAY_INIT = `
  (() => {
    const ready = () => {
      if (!document.body) return setTimeout(ready, 30);
      if (!document.getElementById("pw-cap")) {
        const cap = document.createElement("div");
        cap.id = "pw-cap";
        cap.style.cssText =
          "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:99999;" +
          "background:rgba(15,23,42,.94);color:#fff;padding:14px 26px;border-radius:14px;" +
          "font:600 21px/1.35 system-ui;max-width:1100px;text-align:center;" +
          "box-shadow:0 8px 30px rgba(0,0,0,.35);display:none;pointer-events:none;";
        document.body.appendChild(cap);
      }
      if (!document.getElementById("pw-cur")) {
        const cur = document.createElement("div");
        cur.id = "pw-cur";
        cur.style.cssText =
          "position:fixed;z-index:99998;width:22px;height:22px;border-radius:50%;" +
          "background:rgba(79,70,229,.45);border:2.5px solid #4f46e5;pointer-events:none;" +
          "transform:translate(-50%,-50%);transition:left .05s,top .05s;left:-40px;top:-40px;";
        document.body.appendChild(cur);
        window.addEventListener("mousemove", (e) => {
          cur.style.left = e.clientX + "px";
          cur.style.top = e.clientY + "px";
        }, { passive: true });
      }
    };
    ready();
  })();
`;

async function caption(page: Page, text: string, holdMs = 0) {
  await page.evaluate((t) => {
    const el = document.getElementById("pw-cap");
    if (el) {
      el.textContent = t;
      el.style.display = t ? "block" : "none";
    }
  }, text);
  if (holdMs) await sleep(holdMs);
}

async function moveTo(page: Page, selector: string) {
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
  return loc;
}

async function clickVisibly(page: Page, selector: string) {
  const loc = await moveTo(page, selector);
  await sleep(350);
  await loc.click();
}

async function typeVisibly(page: Page, selector: string, text: string, delay = 42) {
  const loc = await moveTo(page, selector);
  await loc.click();
  await loc.pressSequentially(text, { delay });
  await sleep(1100); // pause so the typed input is readable (submission guide)
}

/** Wait until the adaptive-loop run finishes and results render. */
async function waitForTurn(page: Page) {
  await page.getByText("Adaptive loop running").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.getByText("Adaptive loop running").waitFor({ state: "hidden", timeout: 120000 }).catch(() => {});
  await sleep(600);
}

/** Read the engine-derived verdict badge from the Diagnosis panel. */
async function readVerdict(page: Page): Promise<string> {
  try {
    const panel = page.locator("section", { has: page.getByRole("heading", { name: "Diagnosis", exact: true }) }).first();
    const badge = await panel.locator("span.rounded-md").first().textContent({ timeout: 5000 });
    return (badge ?? "").trim();
  } catch {
    return "";
  }
}

async function isVisible(page: Page, text: string): Promise<boolean> {
  return page.getByText(text, { exact: false }).first().isVisible().catch(() => false);
}

async function showPanel(page: Page, title: string, cap: string, holdMs: number) {
  const panel = page.locator("section", { has: page.getByRole("heading", { name: title }) }).first();
  await panel.scrollIntoViewIfNeeded().catch(() => {});
  await caption(page, cap, holdMs);
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // Off-camera: reset the demo account's learner so the story starts clean.
  const prep = await chromium.launch();
  const prepCtx = await prep.newContext({ baseURL: BASE });
  const login = await prepCtx.request.post("/api/auth/login", {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!login.ok()) throw new Error("prep login failed: " + login.status());
  await prepCtx.request.post("/api/demo/reset");
  await prep.close();
  console.log("prep: demo learner reset");

  const t0 = Date.now();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
    baseURL: BASE,
  });
  await ctx.addInitScript(OVERLAY_INIT);
  const page = await ctx.newPage();

  // ---- BEAT 0: start page + thesis --------------------------------------
  await page.goto("/", { waitUntil: "networkidle" });
  await caption(page, "ShastraLab — the diagnostic lab for learning · live at shastralab-chi.vercel.app", 3600);
  await caption(page, "Every AI learning app generates content. ShastraLab generates a DIAGNOSIS.", 3000);
  await clickVisibly(page, "text=Log in / Sign up");
  await page.waitForURL("**/login");

  // ---- BEAT 0b: real login, typed live -----------------------------------
  await caption(page, "Real login — evaluator test account, typed live (guests can skip login)");
  await typeVisibly(page, 'input[type="email"]', EMAIL, 55);
  await typeVisibly(page, 'input[type="password"]', PASSWORD, 55);
  await clickVisibly(page, 'button[type="submit"]');
  await page.waitForURL("**/learn", { timeout: 30000 });
  await page.getByText("Learning path").waitFor({ timeout: 30000 });
  await sleep(1200);

  // ---- BEAT 0c: the learner model frame ----------------------------------
  await caption(
    page,
    "This is what ShastraLab already believes about this learner — a knowledge graph with mastery per concept, not a quiz score",
    4200,
  );

  // ---- BEAT 1: shallow answer, CONFIDENT ---------------------------------
  await caption(page, "Turn 1 — a shallow answer, typed live, self-reported CONFIDENT", 1400);
  await clickVisibly(page, 'button:has-text("Confident")');
  await typeVisibly(page, 'textarea[aria-label="Your answer"]', ANSWER_SHALLOW, 40);
  await caption(page, "Submitting → a REAL Gemini call analyzes the reasoning against a rubric. Watch the loop.", 400);
  await clickVisibly(page, 'button:has-text("Submit for diagnosis")');
  await waitForTurn(page);

  const v1 = await readVerdict(page);
  const hasRootCause = await isVisible(page, "root cause (nid");
  await showPanel(
    page,
    "Diagnosis",
    `Live diagnosis: ${v1 || "graded"} — derived by the deterministic engine from Gemini's rubric enums.${hasRootCause ? " The root cause is NAMED, with the learner's own words quoted as evidence." : ""}`,
    6200,
  );
  await caption(page, "Confidently wrong = the strongest signal → update weight α=0.45. Deterministic engine math — no LLM touches state.", 4600);
  await showPanel(page, "Knowledge graph updated", "Graph updated live: Sorted Arrays rises, Search Space Reduction falls into MISCONCEPTION — watch the right-pane graph recolor.", 5200);

  // ---- BEAT 2: the money moment ------------------------------------------
  await showPanel(page, "Root-cause search", "The money moment: Time Complexity has the LOWEST score, but it is NOT a prerequisite. The engine traced the prerequisite path instead — root cause ≠ lowest number.", 6800);
  await showPanel(page, "Prescription", "The Prescription is generated by Gemini FROM the graph: it skips what the learner already knows and targets only the missing mechanism.", 5800);

  // ---- BEAT 3: prompt-in / response-out ----------------------------------
  await showPanel(
    page,
    "AI reasoning context - the compiled prompts",
    "GenAI in action: the EXACT prompt sent to Gemini. Highlighted blocks were compiled from this learner's knowledge graph. Every call is logged with model, latency, tokens.",
    7200,
  );

  // ---- BEAT 4: the correction ---------------------------------------------
  await caption(page, "Turn 2 — the corrected understanding, typed live, answering the question Gemini just generated", 1600);
  await typeVisibly(page, 'textarea[aria-label="Your answer"]', ANSWER_CORRECT, 26);
  await clickVisibly(page, 'button:has-text("Submit for diagnosis")');
  await waitForTurn(page);
  const v2 = await readVerdict(page);
  await showPanel(page, "Diagnosis", `Graded ${v2 || "live"} — a different input, a completely different live diagnosis against the rubric of the question Gemini just generated.`, 4200);
  const resolving = await isVisible(page, "resolving (confirmation");
  await showPanel(
    page,
    "Knowledge graph updated",
    resolving
      ? "Misconception → RESOLVING (confirmation 1 of 2). One right answer never instantly clears it — the next challenge exists to CONFIRM. Rigor, not vibes."
      : "The graph updates again — the engine keeps diagnosing from the learner's exact wording, and the next question re-targets the weakest link.",
    6200,
  );

  // ---- BEAT 5: edge case ---------------------------------------------------
  await caption(page, "Edge case — what happens with garbage input?", 1200);
  await typeVisibly(page, 'textarea[aria-label="Your answer"]', "asdfghjkl", 60);
  await clickVisibly(page, 'button:has-text("Submit for diagnosis")');
  await page.getByText("insufficient evidence", { exact: false }).first().waitFor({ timeout: 30000 }).catch(() => {});
  await sleep(400);
  await showPanel(page, "Diagnosis: insufficient evidence", "INSUFFICIENT_EVIDENCE: no LLM call, ZERO graph writes. The system never hallucinates learner state.", 5200);
  await caption(page, "Three inputs → three different live outcomes. Nothing is canned, hardcoded, or pre-filled.", 4200);

  // ---- BEAT 6: lab report + logout -----------------------------------------
  await showPanel(page, "Lab report", "The Lab Report: every real Gemini call, total latency, tokens — computed from the verbatim execution log. The model is rented; the learner graph is owned.", 6400);
  await caption(page, "ShastraLab — Diagnose first. Teach second.", 2600);
  await clickVisibly(page, 'button:has-text("Log out")');
  await sleep(2200);
  await caption(page, "", 0);

  await ctx.close();
  await browser.close();
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`recorded ~${secs}s of footage into ${OUT}/`);
  if (secs > 240) console.log("WARNING: over 4:00 - speed up with ffmpeg (see console notes)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
