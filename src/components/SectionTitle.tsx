import { cn } from "@/lib/utils";

interface SectionTitleProps {
  children: string;
  className?: string;
  as?: "h1" | "h2" | "h3";
}

function splitTitle(title: string): { body: string; last: string } {
  const parts = title.toUpperCase().replace(/\s+/g, "_").split("_").filter(Boolean);
  const last = parts.pop() ?? title.toUpperCase();
  const body = parts.length > 0 ? parts.join("_") : "";
  return { body, last };
}

export function SectionTitle({ children, className, as: Tag = "h2" }: SectionTitleProps) {
  const { body, last } = splitTitle(children);

  return (
    <Tag
      className={cn(
        "font-black text-5xl md:text-7xl tracking-tighter leading-[0.85] uppercase flex flex-col font-headline",
        className
      )}
    >
      {body ? (
        <>
          {/* First line: inverted box, text extruded with layered text-shadow */}
          <span
            className="bg-on-background text-surface inline-block self-start px-2 -translate-x-4"
            style={{
              textShadow: [
                "1px 1px 0 #8a8776",
                "2px 2px 0 #7c7a69",
                "3px 3px 0 #6e6c5c",
                "4px 4px 0 #605e4f",
                "5px 5px 0 #525042",
                "6px 6px 0 #444235",
                "7px 7px 0 #363428",
                "8px 8px 0 #28261b",
                "9px 9px 0 #1a190e",
              ].join(", "),
            }}
          >
            {body}_
          </span>
          {/* Last word: solid filled */}
          <span className="text-primary">
            {last}
          </span>
        </>
      ) : (
        /* Single word: just the inverted box with extrusion */
        <span
          className="bg-on-background text-surface inline-block self-start px-2 -translate-x-4"
          style={{
            textShadow: [
              "1px 1px 0 #8a8776",
              "2px 2px 0 #7c7a69",
              "3px 3px 0 #6e6c5c",
              "4px 4px 0 #605e4f",
              "5px 5px 0 #525042",
              "6px 6px 0 #444235",
              "7px 7px 0 #363428",
              "8px 8px 0 #28261b",
              "9px 9px 0 #1a190e",
            ].join(", "),
          }}
        >
          {last}
        </span>
      )}
    </Tag>
  );
}
