import type { EdgeType, QuestionSpec } from "./engine/types";

// ---------------------------------------------------------------------------
// Seeded domain: Binary Search. The topology is engineered so every engine
// algorithm has something non-trivial to do: time_complexity is the NUMERICALLY
// lowest concept but sits on a RELATED_TO edge, so the bottleneck search must
// pass it over in favor of search_space_reduction on the prerequisite path.
// ---------------------------------------------------------------------------

export const TOPIC_ID = "binary_search";

export interface ConceptSeed {
  id: string;
  name: string;
  graphX: number;
  graphY: number;
  /** What counts as PRESENT for this concept - injected into the analysis rubric. */
  rubricHint: string;
  /** Honest keyword fallback (used ONLY when the LLM is unavailable, loudly labeled). */
  keywords: string[];
}

export const CONCEPTS: ConceptSeed[] = [
  {
    id: "arrays",
    name: "Arrays",
    graphX: 60,
    graphY: 40,
    rubricHint: "References indexed/contiguous element access.",
    keywords: ["array", "index", "element", "position"],
  },
  {
    id: "sorted_arrays",
    name: "Sorted Arrays",
    graphX: 60,
    graphY: 130,
    rubricHint:
      "Notes that sorted order guarantees which DIRECTION the target lies in relative to any element.",
    keywords: ["sorted", "order", "ascending", "smaller", "larger", "direction"],
  },
  {
    id: "divide_and_conquer",
    name: "Divide & Conquer",
    graphX: 230,
    graphY: 40,
    rubricHint:
      "Frames the approach as repeatedly splitting the problem into smaller subproblems.",
    keywords: ["divide", "split", "half", "subproblem", "smaller"],
  },
  {
    id: "search_space_reduction",
    name: "Search Space Reduction",
    graphX: 230,
    graphY: 130,
    rubricHint:
      "States that comparing with the middle element lets you ELIMINATE half of the remaining candidates each step. Naming speed alone is NOT this concept.",
    keywords: [
      "eliminate",
      "discard",
      "half",
      "middle",
      "remaining",
      "reduce",
      "search space",
      "narrow",
    ],
  },
  {
    id: "binary_search",
    name: "Binary Search",
    graphX: 145,
    graphY: 225,
    rubricHint:
      "Describes the midpoint-compare-then-recurse/iterate procedure correctly.",
    keywords: ["middle", "midpoint", "compare", "left", "right", "target"],
  },
  {
    id: "time_complexity",
    name: "Time Complexity",
    graphX: 320,
    graphY: 225,
    rubricHint: "Connects halving to O(log n) steps.",
    keywords: ["log", "logarithmic", "o(log", "complexity", "steps"],
  },
  {
    id: "linear_search",
    name: "Linear Search",
    graphX: 20,
    graphY: 225,
    rubricHint:
      "Sequential one-by-one scan - the concept binary search is most often confused with.",
    keywords: ["linear", "sequential", "one by one", "every element", "scan"],
  },
];

export const EDGES: { fromId: string; toId: string; type: EdgeType }[] = [
  { fromId: "arrays", toId: "sorted_arrays", type: "PREREQUISITE_OF" },
  { fromId: "sorted_arrays", toId: "binary_search", type: "PREREQUISITE_OF" },
  { fromId: "divide_and_conquer", toId: "binary_search", type: "PREREQUISITE_OF" },
  { fromId: "search_space_reduction", toId: "binary_search", type: "PREREQUISITE_OF" },
  { fromId: "time_complexity", toId: "binary_search", type: "RELATED_TO" },
  { fromId: "linear_search", toId: "binary_search", type: "COMMONLY_CONFUSED_WITH" },
];

/** Alex's prior-session state. attempts>0 = evidence exists; linear_search is untouched. */
export const TEMPLATE_STATES: { conceptId: string; mastery: number; attempts: number }[] = [
  { conceptId: "arrays", mastery: 0.9, attempts: 6 },
  { conceptId: "sorted_arrays", mastery: 0.82, attempts: 5 },
  { conceptId: "divide_and_conquer", mastery: 0.38, attempts: 3 },
  { conceptId: "search_space_reduction", mastery: 0.28, attempts: 2 },
  { conceptId: "binary_search", mastery: 0.42, attempts: 3 },
  { conceptId: "time_complexity", mastery: 0.25, attempts: 2 },
  { conceptId: "linear_search", mastery: 0.5, attempts: 0 },
];

/** The opening diagnostic. Every question carries its own rubric (expected concepts). */
export const OPENING_QUESTION: QuestionSpec = {
  question: "Why does binary search require the array to be sorted?",
  targetConceptId: "binary_search",
  expectedConceptIds: ["sorted_arrays", "search_space_reduction"],
  difficulty: "CORE",
  why: "Diagnostic: separates 'knows it is faster' from 'understands why half the candidates can be eliminated'.",
  source: "CURRICULUM_BANK",
  targetsMisconceptionId: null,
};

/**
 * Authored backup questions, one per concept. Served (chip-labeled
 * "ENGINE - curriculum bank", never presented as AI output) only if the
 * generated question fails validation.
 */
export const QUESTION_BANK: Record<string, QuestionSpec> = {
  search_space_reduction: {
    question:
      "If the target is smaller than the middle element, what happens to the search space - and what guarantees that this is safe?",
    targetConceptId: "search_space_reduction",
    expectedConceptIds: ["search_space_reduction", "sorted_arrays"],
    difficulty: "CORE",
    why: "Tests the halving mechanism directly.",
    source: "CURRICULUM_BANK",
  },
  divide_and_conquer: {
    question:
      "In your own words, what does it mean to solve a problem by 'divide and conquer', using search as the example?",
    targetConceptId: "divide_and_conquer",
    expectedConceptIds: ["divide_and_conquer", "search_space_reduction"],
    difficulty: "INTRO",
    why: "Rebuilds the prerequisite framing.",
    source: "CURRICULUM_BANK",
  },
  binary_search: {
    question:
      "A sorted array contains duplicates. How would you adapt binary search to find the FIRST occurrence of the target?",
    targetConceptId: "binary_search",
    expectedConceptIds: ["binary_search", "search_space_reduction"],
    difficulty: "APPLIED",
    why: "Application challenge: understanding to skill.",
    source: "CURRICULUM_BANK",
  },
  sorted_arrays: {
    question:
      "What does sorted order tell you about where a target can be, relative to any element you inspect?",
    targetConceptId: "sorted_arrays",
    expectedConceptIds: ["sorted_arrays"],
    difficulty: "INTRO",
    why: "Reinforces the ordering guarantee.",
    source: "CURRICULUM_BANK",
  },
  time_complexity: {
    question:
      "Roughly how many steps does binary search need on an array of one million elements, and why?",
    targetConceptId: "time_complexity",
    expectedConceptIds: ["time_complexity", "search_space_reduction"],
    difficulty: "CORE",
    why: "Connects halving to O(log n).",
    source: "CURRICULUM_BANK",
  },
};

/** Learning-path rail order for the left pane. */
export const PATH_ORDER = [
  "arrays",
  "sorted_arrays",
  "divide_and_conquer",
  "search_space_reduction",
  "binary_search",
  "time_complexity",
];
