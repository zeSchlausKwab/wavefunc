import { useState, useEffect } from "react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { useFeaturedLists } from "../lib/hooks/useFeaturedLists";
import { useFavoriteStations } from "../lib/hooks/useFavorites";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import { NDKWFFavorites } from "../lib/NDKWFFavorites";
import { RadioCard } from "./RadioCard";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "./ui/carousel";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function splitTitle(name: string): { body: string; last: string } {
  const parts = name.toUpperCase().replace(/\s+/g, "_").split("_").filter(Boolean);
  const last = parts.pop() ?? "LIST";
  const body = parts.join("_");
  return { body, last };
}

// ─── Module ───────────────────────────────────────────────────────────────────

function FeaturedListModule({ list, index }: { list: NDKWFFavorites; index: number }) {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const { stations } = useFavoriteStations(list);
  const { zaps, comments, reactions, userHasReacted } = useSocialInteractions(list);

  const handleResonate = async () => {
    if (!currentUser || !ndk) return;
    await list.react("❤️");
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/favorites`);
  };

  const { body, last } = splitTitle(list.name || "UNKNOWN_LIST");
  const packId = (list.favoritesId ?? "XX-00").slice(0, 8).toUpperCase();
  const watermark = `CONSTRUCT_${String(index + 1).padStart(2, "0")}`;

  return (
    <div className="bg-surface-container-high border-4 border-on-background shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] flex flex-col md:flex-row min-h-[650px] relative overflow-hidden">

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
          <h2 className="text-5xl font-black tracking-tighter uppercase leading-none font-headline mb-2 relative z-10">
            {body && <>{body}_<br /></>}
            <span className="text-primary">{last}</span>
          </h2>
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
        <div className="flex-grow space-y-3 mb-6">
          {stations.length === 0 && (
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/40 py-4">
              NO_STATIONS_LOADED
            </div>
          )}
          {stations.slice(0, 5).map((station, i) => (
            <RadioCard
              key={station.id}
              station={station}
              variant="featured-item"
              index={i}
            />
          ))}
          {stations.length > 5 && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-outline/60 pt-1">
              +{stations.length - 5} MORE_STATIONS
            </p>
          )}
        </div>

        {/* Social toolbar */}
        <div className="mt-auto flex items-center justify-between pt-4 border-t-4 border-on-background">
          <div className="flex gap-4">
            <button className="flex items-center gap-1 hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-sm">chat_bubble</span>
              {comments > 0 && <span className="text-[10px] font-bold">{formatCount(comments)}</span>}
            </button>
            <button className="flex items-center gap-1 hover:text-secondary-fixed-dim transition-colors">
              <span
                className="material-symbols-outlined text-sm"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                bolt
              </span>
              {zaps > 0 && <span className="text-[10px] font-bold">{formatCount(zaps)}</span>}
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
            <span
              className="material-symbols-outlined text-sm"
              style={{ fontVariationSettings: userHasReacted ? "'FILL' 1" : "'FILL' 0" }}
            >
              favorite
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest">
              {reactions > 0 ? `RESONATE · ${formatCount(reactions)}` : "RESONATE"}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── FeaturedLists ────────────────────────────────────────────────────────────

export function FeaturedLists() {
  const { featuredLists, isLoading, appPubkey } = useFeaturedLists();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());
    api.on("select", () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  if (!appPubkey && !isLoading) return null;

  if (isLoading) {
    return (
      <div className="mb-16 border-4 border-on-background p-8 bg-surface-container-low flex items-center gap-4">
        <span className="material-symbols-outlined text-3xl animate-spin">sync</span>
        <span className="font-black uppercase tracking-tight">LOADING_FEATURED_COLLECTIONS...</span>
      </div>
    );
  }

  if (featuredLists.length === 0) return null;

  return (
    <div className="mb-16 space-y-6">

      {/* Section header */}
      <div className="flex items-baseline gap-4">
        <h2 className="text-5xl md:text-6xl font-black uppercase tracking-tighter font-headline">
          FEATURED_COLLECTIONS
        </h2>
        <div className="h-2 flex-grow bg-on-background" />
        <span className="font-bold text-primary text-sm hidden md:block tracking-widest uppercase">
          CURATED_SIGNAL
        </span>
      </div>

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
