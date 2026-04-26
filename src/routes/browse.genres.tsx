import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import {
  useStationCount,
  useStationsObserver,
} from "../lib/nostr/hooks/useStations";
import { useFilterStore } from "../stores/filterStore";

export const Route = createFileRoute("/browse/genres")({
  component: BrowseGenres,
});

type FilterType = "genres" | "languages" | "countries";

const GENRE_ICONS = [
  "graphic_eq", "waves", "headphones", "music_note", "radio",
  "album", "queue_music", "piano", "electric_bolt", "blur_on",
  "schema", "hive", "equalizer", "surround_sound", "speaker",
  "podcasts", "mic", "tune", "hub", "rss_feed",
];

const TAB_CONFIG: Record<FilterType, { label: string; sectionTitle: string; icon: string; searchPlaceholder: string }> = {
  genres: {
    label: "GENRES",
    sectionTitle: "OSCILLATION_TYPES",
    icon: "graphic_eq",
    searchPlaceholder: "SEARCH_GENRES...",
  },
  languages: {
    label: "LANGUAGES",
    sectionTitle: "TRANSMISSION_LANGUAGES",
    icon: "translate",
    searchPlaceholder: "SEARCH_LANGUAGES...",
  },
  countries: {
    label: "COUNTRIES",
    sectionTitle: "BROADCAST_REGIONS",
    icon: "public",
    searchPlaceholder: "SEARCH_REGIONS...",
  },
};

function BrowseGenres() {
  const navigate = useNavigate();
  const { setGenres, setLanguages, setCountries } = useFilterStore();
  const { events, eose } = useStationsObserver({ limit: 500 });
  const totalStations = useStationCount();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterType>("genres");

  const genreCounts = events.reduce((acc, station) => {
    station.genres.forEach((genre) => {
      const key = genre.toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const languageCounts = events.reduce((acc, station) => {
    station.languages.forEach((language) => {
      const key = language.toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const countryCounts = events.reduce((acc, station) => {
    const country = station.countryCode;
    if (country) {
      const key = country.toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const sortedGenres = Object.entries(genreCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([item, count]) => ({ item, count }));

  const sortedLanguages = Object.entries(languageCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([item, count]) => ({ item, count }));

  const sortedCountries = Object.entries(countryCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([item, count]) => ({ item, count }));

  const allData: Record<FilterType, { item: string; count: number }[]> = {
    genres: sortedGenres,
    languages: sortedLanguages,
    countries: sortedCountries,
  };

  const filteredData = allData[activeTab].filter(({ item }) =>
    item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTabChange = (tab: FilterType) => {
    setActiveTab(tab);
    setSearchQuery("");
  };

  const handleItemClick = (item: string) => {
    if (activeTab === "genres") {
      setGenres([item]);
    } else if (activeTab === "languages") {
      setLanguages([item]);
    } else {
      setCountries([item]);
    }
    navigate({ to: "/", search: {} });
  };

  const config = TAB_CONFIG[activeTab];
  const total = allData[activeTab].length;

  return (
    <div className="space-y-6">

      {/* Tab selector */}
      <div className="flex border-4 border-on-background">
        {(["genres", "languages", "countries"] as FilterType[]).map((tab, i) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`flex-1 py-3 font-black uppercase tracking-tight text-[11px] sm:text-sm transition-colors flex items-center justify-center gap-1.5 ${
              i < 2 ? "border-r-4 border-on-background" : ""
            } ${
              activeTab === tab
                ? "bg-on-background text-surface"
                : "hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {TAB_CONFIG[tab].icon}
            </span>
            <span className="hidden sm:inline">{TAB_CONFIG[tab].label}</span>
          </button>
        ))}
      </div>

      {/* Section header */}
      <SectionHeader label={eose && total > 0 ? `${filteredData.length}/${total}` : undefined}>
        {config.sectionTitle}
      </SectionHeader>

      {/*
        Sampling disclosure. Without this, the per-tag counts below
        look authoritative — but they're computed from a 500-event
        window of the ~50k-station corpus. Showing the real total
        next to the loaded sample makes the discrepancy honest.
      */}
      {eose && totalStations !== null && events.length < totalStations && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/40 -mt-3">
          COUNTS_FROM_{events.length.toLocaleString()}_OF_{totalStations.toLocaleString()}_SAMPLED
        </p>
      )}

      {/* Search */}
      {eose && total > 0 && (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-on-background/50 pointer-events-none">
            search
          </span>
          <input
            type="text"
            placeholder={config.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border-2 border-on-background bg-surface-container-low pl-10 pr-4 py-2.5 font-bold uppercase tracking-widest text-[11px] focus:outline-none focus:border-primary placeholder:text-on-background/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-background/50 hover:text-on-background"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {!eose && (
        <div className="border-4 border-on-background p-8 bg-surface-container-low flex items-center gap-4">
          <span className="material-symbols-outlined text-3xl animate-spin">sync</span>
          <span className="font-black uppercase tracking-tight">
            SCANNING_{activeTab.toUpperCase()}...
          </span>
        </div>
      )}

      {/* Genres — mechanical row grid */}
      {eose && activeTab === "genres" && (
        <>
          {filteredData.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredData.map(({ item, count }, i) => (
                <button
                  key={item}
                  onClick={() => handleItemClick(item)}
                  className="bg-surface-container-low border-4 border-on-background p-4 shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] flex items-center gap-4 group transition-all hover:bg-secondary-fixed-dim text-left hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
                >
                  <div className="w-12 h-12 shrink-0 bg-surface border-2 border-on-background flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary group-hover:text-on-background transition-colors">
                      {GENRE_ICONS[i % GENRE_ICONS.length]}
                    </span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-base font-black uppercase leading-tight truncate">
                      {item}
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-tighter opacity-60">
                      STATIONS: {String(count).padStart(2, "0")}
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-xl opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0">
                    chevron_right
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState message="NO_GENRES_FOUND" />
          )}
        </>
      )}

      {/* Languages & Countries — aspect-square code boxes */}
      {eose && (activeTab === "languages" || activeTab === "countries") && (
        <>
          {filteredData.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredData.map(({ item, count }) => (
                <button
                  key={item}
                  onClick={() => handleItemClick(item)}
                  className="aspect-square bg-surface-container-high border-2 border-on-background flex flex-col items-center justify-center relative group overflow-hidden hover:bg-on-background hover:text-surface transition-all"
                >
                  <div className="text-4xl sm:text-5xl font-black leading-none group-hover:scale-110 transition-transform uppercase">
                    {item}
                  </div>
                  <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end text-[8px] font-bold uppercase tracking-tight">
                    <span className="opacity-50">STATIONS</span>
                    <span className="text-primary group-hover:text-surface/70 font-black text-[11px]">
                      {count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState message={`NO_${activeTab.toUpperCase()}_FOUND`} />
          )}
        </>
      )}

    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border-4 border-on-background p-12 text-center bg-surface-container-high">
      <span className="material-symbols-outlined text-5xl text-on-background/20 block mb-4">
        search_off
      </span>
      <div className="font-black uppercase tracking-tight text-on-background/50">
        {message}
      </div>
    </div>
  );
}
