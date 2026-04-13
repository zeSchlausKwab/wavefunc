import { useMemo } from "react";
import type { ParsedStation } from "../lib/nostr/domain";
import { RadioCard } from "./RadioCard";
import { SectionHeader } from "./SectionHeader";

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

export function GenreCarousel({ genre, stations }: GenreCarouselProps) {
  const shuffledStations = useMemo(
    () => shuffled(stations).slice(0, 10),
    [stations],
  );

  if (shuffledStations.length === 0) return null;

  return (
    <section>
      <SectionHeader
        className="mb-4"
        label={`${shuffledStations.length}_STATIONS`}
      >
        {genre.toUpperCase()}
      </SectionHeader>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
        {shuffledStations.map((station) => (
          <div key={station.id} className="shrink-0 w-[220px]">
            <RadioCard station={station} />
          </div>
        ))}
      </div>
    </section>
  );
}
