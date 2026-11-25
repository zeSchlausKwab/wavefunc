import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function BackupAppLink({
  size = "sm",
  className,
  showLabel = false,
}: {
  size?: "sm" | "md";
  className?: string;
  showLabel?: boolean;
}) {
  const label = "Back up this song as audio or video in the WaveFunc app";
  return (
    <Link
      to="/apps"
      onClick={(event) => event.stopPropagation()}
      aria-label={label}
      title={label}
      className={cn(
        "flex items-center justify-center transition-colors hover:text-primary",
        showLabel
          ? "min-h-11 gap-2 border-2 border-on-background px-3 text-[10px] font-black uppercase tracking-widest"
          : "text-on-background/40",
        className,
      )}
    >
      <span aria-hidden="true" className={cn(
        "material-symbols-outlined", size === "sm" ? "text-[14px]" : "text-[18px]",
      )}>cloud_upload</span>
      {showLabel && "Back up in app"}
    </Link>
  );
}
