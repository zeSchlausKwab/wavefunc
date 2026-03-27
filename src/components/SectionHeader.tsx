import { cn } from "../lib/utils";

interface SectionHeaderProps {
  children: React.ReactNode;
  label?: string;
  className?: string;
}

export function SectionHeader({ children, label, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <h2 className="text-2xl sm:text-3xl font-black uppercase italic -skew-x-6 bg-on-background text-surface px-4 py-1 whitespace-nowrap shrink-0">
        {children}
      </h2>
      <div className="flex-1 h-1 bg-outline" />
      {label && (
        <span className="font-bold text-primary text-sm tracking-widest uppercase whitespace-nowrap hidden md:block shrink-0">
          {label}
        </span>
      )}
    </div>
  );
}
