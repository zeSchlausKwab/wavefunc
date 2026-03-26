import { cn } from "@/lib/utils";

interface SmallLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { outer: "p-1.5", inner: "border-[3px]", text: "text-xl" },
  md: { outer: "p-3",   inner: "border-[4px]", text: "text-4xl" },
  lg: { outer: "p-6",   inner: "border-[6px]", text: "text-7xl" },
};

export function SmallLogo({ className, size = "md" }: SmallLogoProps) {
  const s = sizeMap[size];
  return (
    <div
      className={cn(
        "aspect-square border-4 border-on-background flex items-center justify-center bg-surface",
        s.outer,
        className
      )}
    >
      <div className={cn("w-full aspect-square flex items-center justify-center border-on-background", s.inner)}>
        <span className={cn("font-black -rotate-[4deg] font-headline", s.text)}>
          WF
        </span>
      </div>
    </div>
  );
}
