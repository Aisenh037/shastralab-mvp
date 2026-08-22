# DEMO.md — video script (target ≤ 4:00)

**Record on the deployed URL. Type every input live on camera (no prefills). Pause 1s on each typed input so it is readable.**

Before recording: click **Reset session** once, reload.

---

### Beat 0 — the thesis frame (0:00–0:25)
Open `/` (start card), then click **Enter the lab**.
Say/caption: *"Every team here built a content generator. ShastraLab is a diagnosis engine — it finds the root cause blocking a learner, using a knowledge graph + a prompt compiler + Gemini in a loop."*
Point at: the already-colored knowledge graph (right pane) — *"this is what the system already believes about learner Alex."*

### Beat 1 — the shallow answer (0:25–1:15)
Question on screen: **"Why does binary search require the array to be sorted?"**
Select confidence **Confident**, type LIVE:

```
Because the array is in order, so searching gets much faster.
```

Submit. While the loop runs, point at the live step list.
When the Diagnosis lands, point out, in order:
1. **PARTIAL** badge — *"derived by the engine from rubric enums, the model never emits a score"*
2. root cause chip: **SPEED_WITHOUT_MECHANISM** + your own words quoted back
3. calibration line: *confident + partial → α=0.45 — "confidently wrong moves the model hardest"*
4. **Knowledge graph updated** — sorted_arrays rises, search_space_reduction falls & turns red

### Beat 2 — the money moment (1:15–1:45)
Read the **Root-cause search** panel aloud: *"Time Complexity has the LOWEST score — but the engine picked Search Space Reduction, because it is on the prerequisite path. Lowest number ≠ root cause. That's the graph reasoning."*
Then the **Prescription** (Gemini, receipts chip): dictionary analogy, built on concepts Alex already has.

### Beat 3 — prompt-in / response-out (1:45–2:20)
Open **AI reasoning context** (auto-expanded): *"This is the EXACT prompt sent to Gemini — the highlighted blocks were injected from Alex's knowledge graph. Strong concepts to skip, the misconception to target. This is the prompt compiler — our core IP."*
Point at the GEMINI chips: model name, seconds, tokens — *"every call logged, receipts on every panel."*

### Beat 4 — the correction (2:20–3:00)
The next question (Gemini-generated, targets search_space_reduction) is on screen. Confidence **Confident**, type LIVE:

```
We discard the right half and keep searching the left half. That is safe because sorted order guarantees the target cannot be in the half we eliminated.
```

Submit. Point out: **CORRECT**, mastery bar jumps (delta capped at +25), and the misconception goes to **RESOLVING — confirmation 1 of 2**: *"one right answer never instantly clears a misconception; the next challenge exists to confirm it. That's rigor, not vibes."*

### Beat 5 — edge case + dynamism proof (3:00–3:40)
Type LIVE: `asdfghjkl` → submit.
Show: **INSUFFICIENT_EVIDENCE — no state change**. *"No LLM call, zero graph writes. The system never hallucinates learner state."*
Then re-answer the current question with different phrasing (any variation) → show the analysis JSON/summary differs: *"nothing here is canned — same pipeline, different reasoning in, different diagnosis out."*

### Beat 6 — the lab report (3:40–4:00)
Point at the **Lab report** card: *"N real Gemini calls, total latency, tokens, zero canned responses — computed from the execution log table. The model is rented. The learner graph is owned. ShastraLab — diagnose first, teach second."*

---

Upload: Drive ("Anyone with the link") or YouTube (unlisted). **Test the link in an incognito window before submitting.**
