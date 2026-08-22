// Shared types for the deterministic engine. Pure data - no Prisma, no I/O.

export type EdgeType =
  | "PREREQUISITE_OF"
  | "RELATED_TO"
  | "APPLIED_IN"
  | "COMMONLY_CONFUSED_WITH";

export type ConceptStatus =
  | "UNKNOWN"
  | "WEAK"
  | "DEVELOPING"
  | "STRONG"
  | "MASTERED"
  | "MISCONCEPTION_DETECTED"
  | "RESOLVING";

export type Confidence = "GUESSING" | "SOMEWHAT" | "CONFIDENT";

export type Finding = "PRESENT" | "MISAPPLIED" | "ABSENT";

export type Correctness = "CORRECT" | "PARTIAL" | "INCORRECT";

export type Verdict = "GRADED" | "INSUFFICIENT_EVIDENCE";

export type StrategyId =
  | "CONCEPTUAL_CORRECTION"
  | "PREREQUISITE_REMEDIATION"
  | "GUIDED_HINT"
  | "CHALLENGE_PROBLEM"
  // named in the enum, not yet implemented as templates:
  | "SIMPLER_EXPLANATION"
  | "REAL_WORLD_ANALOGY"
  | "VISUAL_REASONING";

export type MisconceptionId =
  | "SPEED_WITHOUT_MECHANISM"
  | "SEQUENTIAL_SCAN_CONFUSION"
  | "HALF_ELIMINATION_MISAPPLIED";

export interface EdgeRef {
  fromId: string;
  toId: string;
  type: EdgeType;
}

export interface ConceptStateView {
  conceptId: string;
  mastery: number;
  misconceptionScore: number;
  misconceptionId: string | null;
  status: ConceptStatus;
  attempts: number;
  resolvingCount: number;
}

export interface QuestionSpec {
  question: string;
  targetConceptId: string;
  expectedConceptIds: string[];
  difficulty: "INTRO" | "CORE" | "APPLIED";
  why: string;
  source: "CURRICULUM_BANK" | "GEMINI";
  targetsMisconceptionId?: MisconceptionId | null;
}

export interface ConceptEvidence {
  concept_id: string;
  finding: Finding;
}

export interface AnalysisResult {
  verdict: Verdict;
  concept_evidence: ConceptEvidence[];
  misconception: MisconceptionId | "NONE";
  evidence_quote: string;
  confidence: number;
  reasoning_summary: string;
}
