// Shared view-model types for the Learn screen - mirrors the API payloads
// (loop invariant I5: the UI renders only fields of real payloads).

export interface ConceptRow {
  id: string;
  name: string;
  graphX: number;
  graphY: number;
}

export interface EdgeRow {
  fromId: string;
  toId: string;
  type: string;
}

export interface StateRow {
  conceptId: string;
  mastery: number;
  misconceptionScore: number;
  misconceptionId: string | null;
  status: string;
  attempts: number;
  resolvingCount: number;
}

export interface Question {
  question: string;
  targetConceptId: string;
  expectedConceptIds: string[];
  difficulty: string;
  why: string;
  source: string;
}

export interface LabTotals {
  geminiCalls: number;
  totalLatencyMs: number;
  totalTokens: number;
}

export interface LearnerState {
  learnerId: string;
  name: string;
  user: { email: string; name: string } | null;
  topicId: string;
  bottleneckId: string | null;
  currentQuestion: Question;
  states: StateRow[];
  concepts: ConceptRow[];
  edges: EdgeRow[];
  pathOrder: string[];
  labTotals: LabTotals;
}

export interface Receipt {
  step: string;
  owner: string;
  ms: number;
  note: string;
  at: string;
}

export interface PromptBlock {
  label: string;
  text: string;
  fromGraph?: boolean;
}

export interface CompiledPromptView {
  text: string;
  blocks: PromptBlock[];
}

export interface TurnResult {
  kind: "TURN" | "INSUFFICIENT_EVIDENCE";
  message?: string;
  analysis?: {
    concept_evidence: { concept_id: string; finding: string }[];
    misconception: string;
    evidence_quote: string;
    reasoning_summary: string;
    confidence: number;
  };
  analysisSource?: string;
  analysisMeta?: { latencyMs: number; outputTokens: number; model: string };
  correctness?: string;
  calibration?: { confidence: string; correctness: string; alpha: number };
  graphDelta?: {
    conceptId: string;
    name: string;
    before: number;
    after: number;
    statusAfter: string;
    finding: string;
    alpha: number;
  }[];
  misconceptionEvents?: { conceptId: string; event: string; label: string }[];
  bottleneck?: {
    conceptId: string | null;
    path: string[];
    reason: string;
    decoy: { conceptId: string; mastery: number } | null;
  };
  strategy?: { strategy: string; targetConceptId: string; objective: string };
  compiledPrompts?: { analysis?: CompiledPromptView; generation?: CompiledPromptView };
  intervention?: { text: string; leverages: string[]; source: string };
  interventionMeta?: { latencyMs: number; outputTokens: number; model: string };
  nextQuestion?: Question;
  receipts: Receipt[];
  labTotals?: LabTotals;
  error?: string;
}
