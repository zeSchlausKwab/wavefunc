import { useState, useEffect } from "react";
import { useFeaturedLists } from "../lib/hooks/useFeaturedLists";
import { useFavoriteStations } from "../lib/hooks/useFavorites";
import { RadioCard } from "./RadioCard";
import { SectionTitle } from "./SectionTitle";
import { SectionHeader } from "./SectionHeader";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "./ui/carousel";
import { useCurrentAccount } from "../lib/nostr/auth";
import {
  buildReactionTemplate,
  type ParsedFavoritesList,
} from "../lib/nostr/domain";
import { useWavefuncNostr } from "../lib/nostr/runtime";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}


// ─── Module ───────────────────────────────────────────────────────────────────

function FeaturedListModule({ list, index }: { list: ParsedFavoritesList; index: number }) {
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const { stations, isLoading: stationsLoading } = useFavoriteStations(list);

  const handleResonate = async () => {
    if (!currentUser) return;
    await signAndPublish(buildReactionTemplate(list.event), list.relays);
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/favorites`);
  };

  const packId = (list.favoritesId ?? "XX-00").slice(0, 8).toUpperCase();
  const watermark = `CONSTRUCT_${String(index + 1).padStart(2, "0")}`;

  return (
    <div className="bg-surface-container-high border-4 border-on-background shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] flex flex-col md:flex-row h-[650px] relative overflow-hidden">

      {/* Watermark */}
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 rotate-90 origin-center whitespace-nowrap text-[80px] font-black text-on-background/5 pointer-events-none uppercase select-none">
        {watermark}
      </div>

      {/* Side image */}
      <div className="md:w-1/3 min-h-[200px] border-b-4 md:border-b-0 md:border-r-4 border-on-background bg-on-background overflow-hidden relative group shrink-0">
        {list.banner ? (
          <img
            src={list.banner}
            alt={list.name ?? "List"}
            className="w-full h-full object-cover grayscale contrast-125 group-hover:grayscale-0 transition-all duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-8xl text-surface/10">queue_music</span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-on-background text-surface text-[10px] p-2 font-bold tracking-widest uppercase">
          STATION_VISUAL_FEED
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 flex flex-col relative z-10 min-w-0">

        {/* Header */}
        <div className="relative mb-8">
          <div className="absolute -top-6 -left-6 w-32 h-32 rounded-full border-2 border-primary/30 pointer-events-none" />
          <SectionTitle className="text-5xl md:text-5xl mb-2 relative z-10">
            {list.name || "UNKNOWN LIST"}
          </SectionTitle>
          <div className="flex items-center gap-3">
            <span className="bg-on-background text-surface text-[10px] px-2 py-0.5 font-bold uppercase tracking-tighter">
              PACK_ID: {packId}
            </span>
            <span className="text-outline text-[10px] font-bold uppercase tracking-widest">
              {stations.length} STATION{stations.length !== 1 ? "S" : ""}
            </span>
          </div>
        </div>

        {/* Station rows */}
        <div className="flex-grow overflow-y-auto mb-6 scrollbar-none min-h-0">
          {stationsLoading && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, skeletonIndex) => (
                <div
                  key={skeletonIndex}
                  className="h-16 border-2 border-on-background/10 bg-surface-container-low animate-pulse"
                />
              ))}
            </div>
          )}
          {!stationsLoading && stations.length === 0 && (
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/40 py-4">
              NO_STATIONS_LOADED
            </div>
          )}
          {!stationsLoading && stations.map((station, i) => (
            <RadioCard
              key={station.id}
              station={station}
              variant="featured-item"
              index={i}
            />
          ))}
        </div>

        {/* Social toolbar */}
        <div className="mt-auto flex items-center justify-between pt-4 border-t-4 border-on-background">
          <div className="flex gap-4">
            <button
              className="flex items-center gap-1 hover:text-secondary-fixed-dim transition-colors"
              onClick={handleShare}
              title="Share"
            >
              <span className="material-symbols-outlined text-sm">bolt</span>
            </button>
            <button
              className="flex items-center gap-1 hover:text-primary transition-colors"
              onClick={handleShare}
              title="Share"
            >
              <span className="material-symbols-outlined text-sm">share</span>
            </button>
          </div>
          <button
            className="bg-primary text-white px-4 py-2 flex items-center gap-2 shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
            onClick={handleResonate}
            title="Resonate"
          >
            <span className="material-symbols-outlined text-sm">favorite</span>
            <span className="text-[10px] font-black uppercase tracking-widest">
              RESONATE
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── FeaturedLists ────────────────────────────────────────────────────────────

export function FeaturedLists() {
  const { featuredLists, isLoading } = useFeaturedLists();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());
    api.on("select", () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  if (isLoading) {
    return (
      <div className="mb-16 space-y-6">
        <SectionHeader label="CURATED_SIGNAL">FEATURED_COLLECTIONS</SectionHeader>
        <div className="border-4 border-on-background bg-surface-container-low p-6 shadow-[8px_8px_0px_0px_rgba(29,28,19,1)]">
          <div className="grid gap-6 md:grid-cols-[240px_1fr] min-h-[650px]">
            <div className="border-4 border-on-background bg-on-background/5 animate-pulse" />
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="h-12 w-3/4 bg-on-background/10 animate-pulse" />
                <div className="h-4 w-48 bg-on-background/10 animate-pulse" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-16 border-2 border-on-background/10 bg-surface-container animate-pulse"
                  />
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between border-t-4 border-on-background pt-4">
                <div className="h-4 w-24 bg-on-background/10 animate-pulse" />
                <div className="h-10 w-36 bg-on-background/10 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (featuredLists.length === 0) return null;

  return (
    <div className="mb-16 space-y-6">
      {/* Section header */}
      <SectionHeader label="CURATED_SIGNAL">
        FEATURED_COLLECTIONS
      </SectionHeader>

      {/* Carousel */}
      <Carousel
        setApi={setApi}
        opts={{ align: "start", loop: false }}
        className="w-full"
      >
        <CarouselContent className="-ml-6">
          {featuredLists.map((list, i) => (
            <CarouselItem key={list.favoritesId ?? i} className="pl-6 basis-[90vw] md:basis-[700px]">
              <FeaturedListModule list={list} index={i} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Pagination bar */}
      {count > 1 && (
        <div className="flex items-center gap-3">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              onClick={() => api?.scrollTo(i)}
              className={`h-2 transition-all ${i === current ? "w-12 bg-on-background" : "w-4 bg-outline/30 hover:bg-outline/60"}`}
            />
          ))}
          <span className="ml-auto text-xs font-bold uppercase tracking-widest text-outline">
            SWIPE_TO_EXPLORE
          </span>
        </div>
      )}

      {/* Separator */}
      <div className="border-t-4 border-on-background/20 mt-8" />
    </div>
  );
}
