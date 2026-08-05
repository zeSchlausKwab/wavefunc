import type { StationHealthSummary } from "../lib/nostr/domain";
import { cn } from "../lib/utils";

export function StationHealthBadge({
  health,
  className,
  compact = false,
  showPending = false,
}: {
  health?: StationHealthSummary;
  className?: string;
  compact?: boolean;
  showPending?: boolean;
}) {
  if (!health && !showPending) return null;

  const label = health
    ? compact
      ? `Q_${health.score}`
      : `QUALITY_${health.score}`
    : compact
      ? "Q_—"
      : "QUALITY_PENDING";
  const state = health
    ? health.insecure
      ? "INSECURE"
      : health.status.toUpperCase()
    : "AWAITING_CHECK";
  const title = health
    ? `Quality ${health.score}/100 · ${state} · verified ${new Date(health.checkedAt * 1000).toLocaleString()}`
    : "Station quality check pending";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border-2 border-on-background px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_rgba(29,28,19,1)]",
        !health
          ? "bg-surface-container-high text-on-background/55"
          : health.status === "down"
          ? "bg-primary text-white"
          : health.status === "degraded" || health.insecure
            ? "bg-secondary-fixed-dim text-on-background"
            : "bg-[#a7e5c1] text-on-background",
        className,
      )}
      title={title}
      aria-label={title}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
      {!compact && health && (
        <span className="border-l border-current/30 pl-1 opacity-70">{state}</span>
      )}
    </span>
  );
}
