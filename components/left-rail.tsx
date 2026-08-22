import { Chip, Panel, STATUS_COLOR } from "./ui";
import type { StateRow } from "@/lib/ui-types";

const STATUS_ICON: Record<string, string> = {
  MISCONCEPTION_DETECTED: "✗",
  RESOLVING: "◎",
  MASTERED: "✓",
  STRONG: "✓",
  DEVELOPING: "◐",
};

/** Left pane: the learning path with per-concept status, plus the reading key. */
export function LeftRail({
  pathOrder,
  stateById,
  nameById,
  currentTargetId,
}: {
  pathOrder: string[];
  stateById: Map<string, StateRow>;
  nameById: Map<string, string>;
  currentTargetId: string | undefined;
}) {
  return (
    <aside className="space-y-4">
      <Panel title="Learning path" chip={<Chip kind="ENGINE" />}>
        <ul className="space-y-2 text-sm">
          {pathOrder.map((id) => {
            const s = stateById.get(id);
            const isCurrent = currentTargetId === id;
            const icon = STATUS_ICON[s?.status ?? ""] ?? "○";
            return (
              <li
                key={id}
                className={`flex items-center justify-between ${isCurrent ? "text-foreground" : "text-muted"}`}
              >
                <span className="flex items-center gap-2">
                  <span style={{ color: STATUS_COLOR[s?.status ?? "UNKNOWN"] }}>{icon}</span>
                  {nameById.get(id)}
                </span>
                {isCurrent && <span className="font-mono text-[10px] text-gemini">● current</span>}
              </li>
            );
          })}
        </ul>
      </Panel>
      <Panel title="How to read this">
        <p className="text-xs leading-5 text-muted">
          <span className="text-engine">⚙ ENGINE</span> panels are deterministic - no LLM ever writes learner state.{" "}
          <span className="text-gemini">✦ GEMINI</span> panels are real model calls, each logged with latency and tokens.
        </p>
      </Panel>
    </aside>
  );
}
