import { useToastStore, type Toast } from "../stores/toastStore";
import { cn } from "@/lib/utils";

/**
 * Global toast renderer. Mounted once near the root of the app so any
 * code anywhere can call `showToast(...)` and have it appear without
 * threading state through props. Stacks bottom-up; on mobile we sit
 * above the floating player (which is ~64-80px tall depending on
 * variant).
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      // Stacked column above the floating player. pointer-events-none
      // on the wrapper so areas between toasts stay click-through;
      // each toast turns events back on for itself.
      className="fixed left-0 right-0 z-[80] pointer-events-none flex flex-col items-center gap-2 px-4 bottom-[120px] md:bottom-24"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function toneStyles(tone: Toast["tone"]) {
  switch (tone) {
    case "error":
      return {
        wrap: "bg-destructive text-white",
        icon: "error",
      };
    case "success":
      return {
        wrap: "bg-primary text-white",
        icon: "check_circle",
      };
    case "info":
    default:
      return {
        wrap: "bg-on-background text-surface",
        icon: "info",
      };
  }
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { wrap, icon } = toneStyles(toast.tone);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto w-full max-w-[28rem] border-4 border-on-background shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] flex items-stretch",
        wrap
      )}
    >
      <div className="flex items-center justify-center px-3 border-r-4 border-on-background/30 shrink-0">
        <span className="material-symbols-outlined text-[22px]">{icon}</span>
      </div>

      <div className="flex-1 min-w-0 px-3 py-3 flex flex-col gap-1">
        {toast.title && (
          <p className="text-[10px] font-black uppercase tracking-widest leading-none">
            {toast.title}
          </p>
        )}
        <p className="text-sm font-bold break-words">{toast.message}</p>
      </div>

      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
          className="px-4 border-l-4 border-on-background/30 hover:bg-black/10 active:bg-black/20 transition-colors font-black uppercase tracking-tighter text-xs whitespace-nowrap"
        >
          {toast.action.label}
        </button>
      )}

      <button
        onClick={onDismiss}
        className="px-3 border-l-4 border-on-background/30 hover:bg-black/10 active:bg-black/20 transition-colors shrink-0"
        title="Dismiss"
        aria-label="Dismiss notification"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  );
}
