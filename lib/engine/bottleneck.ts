import { BOTTLENECK_CANDIDATE_BELOW } from "./constants";
import type { ConceptStateView, EdgeRef } from "./types";

export interface BottleneckResult {
  conceptId: string | null;
  /** Concept ids from the bottleneck down to the topic (inclusive). */
  path: string[];
  depth: number;
  /** Engine-composed explanation, rendered verbatim in the UI interstitial. */
  reason: string;
  /** A lower-mastery concept that was NOT picked because it is off the prerequisite path. */
  decoy: { conceptId: string; mastery: number } | null;
}

/**
 * Root-cause (nidan) search. BFS from the topic over REVERSED PREREQUISITE_OF
 * edges only - RELATED_TO / COMMONLY_CONFUSED_WITH never route bottlenecks.
 * Candidates: mastery < 0.5. Pick the MOST UPSTREAM candidate (max depth);
 * tie-break by lower mastery, then by concept id. Sticky: the previous
 * bottleneck is kept while it still qualifies, so the pick never flaps.
 */
export function findBottleneck(
  edges: EdgeRef[],
  states: Map<string, ConceptStateView>,
  topicId: string,
  prevBottleneckId: string | null,
  conceptNames: Map<string, string>,
): BottleneckResult {
  // reverse adjacency: topic -> its prerequisites
  const prereqsOf = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== "PREREQUISITE_OF") continue;
    const list = prereqsOf.get(e.toId) ?? [];
    list.push(e.fromId);
    prereqsOf.set(e.toId, list);
  }

  // BFS: depth + parent chain back toward the topic
  const depth = new Map<string, number>([[topicId, 0]]);
  const childOf = new Map<string, string>(); // prereq -> the node it feeds
  const queue = [topicId];
  while (queue.length) {
    const node = queue.shift()!;
    for (const pre of prereqsOf.get(node) ?? []) {
      if (depth.has(pre)) continue;
      depth.set(pre, depth.get(node)! + 1);
      childOf.set(pre, node);
      queue.push(pre);
    }
  }

  const candidates = [...depth.keys()].filter(
    (id) =>
      id !== topicId &&
      (states.get(id)?.mastery ?? 1) < BOTTLENECK_CANDIDATE_BELOW,
  );

  // The decoy: lowest-mastery concept in the WHOLE graph that is NOT on the
  // prerequisite path - naming it is what proves the traversal did something.
  let decoy: BottleneckResult["decoy"] = null;
  for (const [id, s] of states) {
    if (depth.has(id)) continue;
    if (!decoy || s.mastery < decoy.mastery) decoy = { conceptId: id, mastery: s.mastery };
  }

  if (candidates.length === 0) {
    return { conceptId: null, path: [], depth: 0, reason: "No weak prerequisite is blocking this topic.", decoy };
  }

  let pick: string;
  if (prevBottleneckId && candidates.includes(prevBottleneckId)) {
    pick = prevBottleneckId; // hysteresis: no flapping between near-equal candidates
  } else {
    pick = [...candidates].sort((a, b) => {
      const dd = depth.get(b)! - depth.get(a)!; // deeper (more upstream) first
      if (dd !== 0) return dd;
      const dm = (states.get(a)?.mastery ?? 1) - (states.get(b)?.mastery ?? 1); // lower mastery first
      if (dm !== 0) return dm;
      return a.localeCompare(b); // fully deterministic
    })[0];
  }

  const path: string[] = [pick];
  let cursor = pick;
  while (cursor !== topicId) {
    cursor = childOf.get(cursor)!;
    path.push(cursor);
  }

  const name = (id: string) => conceptNames.get(id) ?? id;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const pickMastery = states.get(pick)?.mastery ?? 0;
  let reason =
    `${name(pick)} (${pct(pickMastery)}) is the weakest concept on the prerequisite path to ` +
    `${name(topicId)}, ${depth.get(pick)} edge${depth.get(pick)! > 1 ? "s" : ""} upstream.`;
  if (decoy && decoy.mastery < pickMastery) {
    reason += ` ${name(decoy.conceptId)} scores lower (${pct(decoy.mastery)}) but is not a prerequisite - it cannot block progress here.`;
  }

  return { conceptId: pick, path, depth: depth.get(pick)!, reason, decoy };
}
