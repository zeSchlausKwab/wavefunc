/**
 * Sleep timer control: icon button that opens a popover with preset
 * durations and an active countdown. Used in both the mobile expanded
 * player sheet and the desktop footer.
 *
 * The component is purely presentational — all state lives in
 * `useSleepTimerStore`. Clicking a preset sets the timer; clicking
 * "Cancel" clears it; the countdown re-renders every 10s via a small
 * internal tick.
 */

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { useSleepTimerStore } from "../stores/sleepTimerStore";

const PRESETS = [15, 30, 45, 60, 90] as const;

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface SleepTimerButtonProps {
  /**
   * Visual variant:
   * - "compact" — small icon-only button that fits in the player bar
   *   transport controls. Shows the remaining time inline when a
   *   timer is active.
   * - "full" — a larger row with an icon, label, and status text.
   *   Used in the mobile nav sheet.
   */
  variant?: "compact" | "full";
  className?: string;
}

export function SleepTimerButton({
  variant = "compact",
  className,
}: SleepTimerButtonProps) {
  const targetAt = useSleepTimerStore((s) => s.targetAt);
  const setTimer = useSleepTimerStore((s) => s.setTimer);
  const cancelTimer = useSleepTimerStore((s) => s.cancelTimer);

  // Tick every second while a timer is active so the countdown
  // updates. When idle, we don't bother with an interval.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (targetAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetAt]);

  const [open, setOpen] = useState(false);
  const remainingMs = targetAt !== null ? targetAt - now : 0;
  const active = targetAt !== null && remainingMs > 0;

  const handlePreset = (minutes: number) => {
    setTimer(minutes);
    setOpen(false);
  };

  const handleCancel = () => {
    cancelTimer();
    setOpen(false);
  };

  const trigger =
    variant === "compact" ? (
      <button
        type="button"
        className={cn(
          "h-full px-3 flex items-center justify-center gap-1 border-l-2 border-on-background/20 hover:bg-surface-variant transition-all",
          active && "text-primary",
          className
        )}
        title={active ? `Sleep in ${formatRemaining(remainingMs)}` : "Sleep timer"}
        aria-label="Sleep timer"
      >
        <span
          className="material-symbols-outlined"
          style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
        >
          bedtime
        </span>
        {active && (
          <span className="font-mono text-[10px] font-bold tabular-nums">
            {formatRemaining(remainingMs)}
          </span>
        )}
      </button>
    ) : (
      <button
        type="button"
        className={cn(
          "flex items-center gap-3 w-full px-4 py-3 border-b-2 border-on-background/10 hover:bg-surface-variant transition-colors text-left",
          className
        )}
        aria-label="Sleep timer"
      >
        <span
          className={cn(
            "material-symbols-outlined text-[20px]",
            active && "text-primary"
          )}
          style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
        >
          bedtime
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-black text-[13px] uppercase tracking-tighter font-headline leading-tight">
            SLEEP_TIMER
          </span>
          <span className="block text-[10px] opacity-70 uppercase tracking-widest leading-none mt-0.5">
            {active
              ? `STOPS_IN_${formatRemaining(remainingMs)}`
              : "TAP_TO_SET"}
          </span>
        </span>
      </button>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="p-0 w-56">
        <div className="px-4 py-3 border-b-4 border-on-background">
          <p className="font-black text-[10px] uppercase tracking-widest text-primary leading-none">
            SLEEP_TIMER
          </p>
          {active && (
            <p className="mt-1 font-mono text-[18px] font-bold tabular-nums leading-none">
              {formatRemaining(remainingMs)}
            </p>
          )}
        </div>
        <ul className="flex flex-col">
          {PRESETS.map((minutes) => (
            <li key={minutes}>
              <button
                type="button"
                onClick={() => handlePreset(minutes)}
                className="w-full px-4 py-2.5 text-left font-bold text-[11px] uppercase tracking-wider border-b-2 border-on-background/10 hover:bg-surface-variant transition-colors"
              >
                {minutes} MIN
              </button>
            </li>
          ))}
          {active && (
            <li>
              <button
                type="button"
                onClick={handleCancel}
                className="w-full px-4 py-2.5 text-left font-bold text-[11px] uppercase tracking-wider text-destructive hover:bg-surface-variant transition-colors"
              >
                CANCEL_TIMER
              </button>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
