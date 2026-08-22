// Small shared primitives for the provenance-first UI. Every AI-adjacent panel
// carries a chip that says WHO produced it: the deterministic engine, Gemini,
// or the loudly-labeled fallback.

export function Chip({
  kind,
  children,
}: {
  kind: "GEMINI" | "ENGINE" | "FALLBACK" | "BANK";
  children?: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    GEMINI: "border-gemini/40 bg-gemini/5 text-gemini",
    ENGINE: "border-engine/40 bg-engine/5 text-engine",
    FALLBACK: "border-warn/50 bg-warn/10 text-warn",
    BANK: "border-line bg-panel-2 text-muted",
  };
  const icon = kind === "GEMINI" ? "✦" : kind === "FALLBACK" ? "△" : "⚙";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide ${styles[kind]}`}
    >
      {icon} {kind === "BANK" ? "ENGINE" : kind}
      {children ? <span className="text-muted">· {children}</span> : null}
    </span>
  );
}

export function Panel({
  title,
  chip,
  children,
  className = "",
  flash = false,
}: {
  title: string;
  chip?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flash?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-panel p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${flash ? "flash" : ""} ${className}`}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
        </h3>
        {chip}
      </header>
      {children}
    </section>
  );
}

export const STATUS_COLOR: Record<string, string> = {
  MASTERED: "#059669",
  STRONG: "#0d9488",
  DEVELOPING: "#2563eb",
  WEAK: "#d97706",
  UNKNOWN: "#94a3b8",
  MISCONCEPTION_DETECTED: "#dc2626",
  RESOLVING: "#7c3aed",
};

export function MasteryBar({
  label,
  value,
  status,
  delta,
}: {
  label: string;
  value: number;
  status?: string;
  delta?: number;
}) {
  const color = STATUS_COLOR[status ?? ""] ?? "#2563eb";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-foreground/90">{label}</span>
        <span className="font-mono text-muted">
          {Math.round(value * 100)}%
          {delta !== undefined && delta !== 0 && (
            <span className={delta > 0 ? "text-engine" : "text-danger"}>
              {" "}
              {delta > 0 ? "+" : ""}
              {Math.round(delta * 100)}
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-panel-2">
        <div
          className="bar-fill h-1.5 rounded-full"
          style={{ width: `${Math.round(value * 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}
