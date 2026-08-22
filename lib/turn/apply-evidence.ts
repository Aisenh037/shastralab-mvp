import { FINDING_WEIGHT, MISCONCEPTIONS } from "../engine/constants";
import { deriveStatus, updateMastery } from "../engine/mastery";
import { applyMisconception } from "../engine/misconception";
import type {
  AnalysisResult,
  ConceptStateView,
  Confidence,
  MisconceptionId,
  QuestionSpec,
} from "../engine/types";

// Step 4 of the adaptive loop, isolated as a pure state transition:
// (states, analysis evidence) -> (mutated states, deltas, misconception events).
// No I/O here - the orchestrator owns persistence, which keeps this unit-testable.

export interface GraphDelta {
  conceptId: string;
  name: string;
  before: number;
  after: number;
  statusBefore: string;
  statusAfter: string;
  alpha: number;
  finding: string;
}

export interface MisconceptionEvent {
  conceptId: string;
  event: string;
  label: string;
}

export interface EvidenceApplication {
  deltas: GraphDelta[];
  misconceptionEvents: MisconceptionEvent[];
  /** Concept ids whose state actually changed - the only rows worth persisting. */
  dirty: Set<string>;
}

export function applyEvidence(opts: {
  /** Mutated in place; caller persists the dirty subset transactionally. */
  states: Map<string, ConceptStateView>;
  analysis: AnalysisResult;
  question: QuestionSpec;
  confidence: Confidence;
  conceptName: Map<string, string>;
}): EvidenceApplication {
  const { states, analysis, question, confidence, conceptName } = opts;
  const originals = new Map([...states].map(([id, s]) => [id, s.mastery]));
  const dirty = new Set<string>();
  const deltas: GraphDelta[] = [];
  const misconceptionEvents: MisconceptionEvent[] = [];

  // Mastery updates from rubric evidence.
  for (const ev of analysis.concept_evidence) {
    const s = states.get(ev.concept_id);
    if (!s) continue;
    const e = FINDING_WEIGHT[ev.finding];
    const { next, alpha } = updateMastery(s.mastery, e, confidence);
    const statusBefore = s.status;
    s.mastery = next;
    s.attempts += 1;
    s.status = deriveStatus(next, s.misconceptionScore, s.attempts, s.resolvingCount);
    dirty.add(ev.concept_id);
    deltas.push({
      conceptId: ev.concept_id,
      name: conceptName.get(ev.concept_id) ?? ev.concept_id,
      before: originals.get(ev.concept_id) ?? next,
      after: next,
      statusBefore,
      statusAfter: s.status,
      alpha,
      finding: ev.finding,
    });
  }

  // Misconception lifecycle: detected/re-confirmed on evidence...
  if (analysis.misconception !== "NONE") {
    const mid = analysis.misconception as MisconceptionId;
    const target = MISCONCEPTIONS[mid]?.targetConceptId;
    const s = target ? states.get(target) : undefined;
    if (s) {
      const event = s.misconceptionId === mid && s.misconceptionScore > 0 ? "RECONFIRMED" : "DETECTED";
      const r = applyMisconception(s.misconceptionScore, s.resolvingCount, event);
      s.misconceptionScore = r.score;
      s.resolvingCount = r.resolvingCount;
      s.misconceptionId = mid;
      s.status = deriveStatus(s.mastery, s.misconceptionScore, s.attempts, s.resolvingCount);
      dirty.add(s.conceptId);
      misconceptionEvents.push({ conceptId: s.conceptId, event, label: MISCONCEPTIONS[mid].label });
    }
  } else if (question.targetsMisconceptionId) {
    // ...or moved toward resolution when a TARGETED question is answered cleanly.
    const mid = question.targetsMisconceptionId as MisconceptionId;
    const target = MISCONCEPTIONS[mid]?.targetConceptId;
    const s = target ? states.get(target) : undefined;
    const targetEv = analysis.concept_evidence.find((ev) => ev.concept_id === target);
    if (s && s.misconceptionId === mid && s.misconceptionScore > 0 && targetEv?.finding === "PRESENT") {
      const r = applyMisconception(s.misconceptionScore, s.resolvingCount, "TARGETED_CORRECT");
      s.misconceptionScore = r.score;
      s.resolvingCount = r.resolvingCount;
      if (r.cleared) s.misconceptionId = null;
      s.status = deriveStatus(s.mastery, s.misconceptionScore, s.attempts, s.resolvingCount);
      dirty.add(s.conceptId);
      misconceptionEvents.push({
        conceptId: s.conceptId,
        event: r.cleared ? "RESOLVED" : "RESOLVING",
        label: MISCONCEPTIONS[mid].label,
      });
    }
  }

  return { deltas, misconceptionEvents, dirty };
}
