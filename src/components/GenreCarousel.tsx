import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParsedStation } from "../lib/nostr/domain";
import { RadioCard } from "./RadioCard";
import { SectionHeader } from "./SectionHeader";
import { cn } from "@/lib/utils";

interface GenreCarouselProps {
  genre: string;
  stations: ParsedStation[];
}

/** Deterministic-ish shuffle seeded by the current hour so it changes
 *  periodically but stays stable within a page session. */
function shuffled<T>(arr: T[]): T[] {
  const seed = Math.floor(Date.now() / 3_600_000); // changes every hour
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = ((seed * (i + 1) * 2654435761) >>> 0) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const CARD_WIDTH_PX = 220;

export function GenreCarousel({ genre, stations }: GenreCarouselProps) {
  const shuffledStations = useMemo(
    () => shuffled(stations).slice(0, 10),
    [stations],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Recompute arrow availability whenever the scroller scrolls or its
  // size changes (window resize, content load).
  const updateArrowState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    updateArrowState();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrowState, { passive: true });
    const ro = new ResizeObserver(updateArrowState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrowState);
      ro.disconnect();
    };
  }, [updateArrowState, shuffledStations.length]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    // Page by ~3 cards; matches typical "next" carousel behavior
    const delta = direction * (CARD_WIDTH_PX + 16) * 3;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  if (shuffledStations.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <SectionHeader label={`${shuffledStations.length}_STATIONS`}>
            {genre.toUpperCase()}
          </SectionHeader>
        </div>
        {/* Carousel arrows — desktop only; mobile users swipe */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <CarouselArrow
            direction="left"
            disabled={!canScrollLeft}
            onClick={() => scrollBy(-1)}
          />
          <CarouselArrow
            direction="right"
            disabled={!canScrollRight}
            onClick={() => scrollBy(1)}
          />
        </div>
      </div>

      {/*
        Desktop (md+) locks each slide to a fixed 360px height so the
        vertical tile cards line up across the row regardless of how
        many genre chips each card carries. RadioCard's tile variant
        uses `flex flex-col flex-1` so its action bar pins to the
        bottom of that 360px box.

        Mobile uses the horizontal compact card layout (~80px tall) and
        was being forced into the 360px box too — leaving a ~280px
        empty rectangle under each card. On mobile we let each card
        use its natural height; items-stretch on the flex row still
        keeps siblings aligned to the tallest of the row.
      */}
      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-none scroll-smooth snap-x"
      >
        {shuffledStations.map((station) => (
          <div
            key={station.id}
            className="shrink-0 w-[220px] md:h-[360px] snap-start flex"
          >
            <RadioCard station={station} className="flex-1" />
          </div>
        ))}
      </div>
    </section>
  );
}

function CarouselArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={direction === "left" ? "Previous" : "Next"}
      className={cn(
        "w-9 h-9 border-2 border-on-background bg-surface flex items-center justify-center transition-all",
        disabled
          ? "opacity-25 cursor-not-allowed"
          : "hover:bg-on-background hover:text-surface active:translate-y-0.5"
      )}
    >
      <span className="material-symbols-outlined text-base">
        {direction === "left" ? "chevron_left" : "chevron_right"}
      </span>
    </button>
  );
}
