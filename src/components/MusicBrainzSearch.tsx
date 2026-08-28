import { useCallback, useEffect, useRef, useState } from "react";
import { getMetadataClient } from "../ctxcn/WavefuncMetadataServerClient";
import { recordingToSongMetadata } from "../lib/musicbrainz";
import { openUrl } from "../lib/openUrl";
import { showToast } from "../stores/toastStore";
import type {
  ArtistResult,
  LabelResult,
  MusicBrainzResult,
  RecordingResult,
  ReleaseResult,
} from "../types/musicbrainz";
import { cn } from "@/lib/utils";
import { SongFavoriteButton } from "./SongFavoriteButton";
import { SongMagicButton } from "./SongMagicButton";

type EntityType = "recordings" | "releases" | "artists" | "labels";

interface MusicBrainzSearchProps {
  initialQuery?: string;
  initialArtist?: string;
}

interface SearchSpec {
  type: EntityType;
  query?: string;
  artist?: string;
  release?: string;
  country?: string;
  date?: string;
}

const SEARCH_LIMIT = 15;
const CATALOG_TIMEOUT_MS = 15_000;

const ENTITY_OPTIONS: {
  value: EntityType;
  label: string;
  icon: string;
  placeholder: string;
}[] = [
  {
    value: "recordings",
    label: "SONGS",
    icon: "music_note",
    placeholder: "SONG_TITLE...",
  },
  {
    value: "releases",
    label: "ALBUMS",
    icon: "album",
    placeholder: "ALBUM_TITLE...",
  },
  {
    value: "artists",
    label: "ARTISTS",
    icon: "person",
    placeholder: "ARTIST_NAME...",
  },
  {
    value: "labels",
    label: "LABELS",
    icon: "business",
    placeholder: "LABEL_NAME...",
  },
];

async function withCatalogTimeout<T>(request: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("The music catalog timed out. Please try again.")),
      CATALOG_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function formatDuration(milliseconds?: number): string | null {
  if (!milliseconds) return null;
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

async function openMusicBrainz(path: string): Promise<void> {
  try {
    await openUrl(`https://musicbrainz.org/${path}`);
  } catch (error) {
    showToast({
      title: "LINK_FAILED",
      message:
        error instanceof Error ? error.message : "Could not open MusicBrainz.",
      tone: "error",
    });
  }
}

function CoverArtwork({
  releaseId,
  label,
  icon = "music_note",
}: {
  releaseId?: string;
  label: string;
  icon?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border-2 border-on-background bg-on-background text-surface sm:h-24 sm:w-24">
      <span className="material-symbols-outlined text-[28px] text-surface/30">
        {icon}
      </span>
      {releaseId && !failed && (
        <img
          src={`https://coverartarchive.org/release/${releaseId}/front-250`}
          alt={`${label} cover`}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function RecordingCard({ recording }: { recording: RecordingResult }) {
  const metadata = recordingToSongMetadata(recording);
  const duration = formatDuration(recording.duration);

  return (
    <article className="border-4 border-on-background bg-background shadow-[5px_5px_0px_0px_rgba(29,28,19,1)]">
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
        <CoverArtwork
          releaseId={recording.releaseId}
          label={recording.release || recording.title}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="bg-primary px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-primary-foreground">
              RECORDING
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-on-background/40">
              {recording.score}%_MATCH
            </span>
          </div>
          <h3 className="break-words font-headline text-lg font-black uppercase leading-none tracking-tighter sm:text-2xl">
            {recording.title}
          </h3>
          <p className="mt-1 truncate text-[11px] font-black uppercase tracking-tight text-primary sm:text-xs">
            {recording.artist || "UNKNOWN_ARTIST"}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-bold uppercase tracking-widest text-on-background/45">
            {recording.release && <span>{recording.release}</span>}
            {recording.releaseDate && <span>{recording.releaseDate}</span>}
            {duration && <span>{duration}</span>}
          </div>
          {recording.tags && recording.tags.length > 0 && (
            <div className="mt-2 hidden flex-wrap gap-1 sm:flex">
              {recording.tags.slice(0, 4).map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="border border-on-background/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-on-background/45"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid min-h-12 grid-cols-[1fr_1fr_48px] border-t-4 border-on-background">
        <SongFavoriteButton
          metadata={metadata}
          showLabel
          size="md"
          className="min-h-12 border-0 border-r-2 border-on-background px-3 hover:bg-surface-container-high"
        />
        <SongMagicButton
          metadata={metadata}
          showLabel
          size="md"
          className="min-h-12 border-0 border-r-2 border-on-background px-3 hover:bg-primary hover:text-primary-foreground"
        />
        <button
          type="button"
          onClick={() => void openMusicBrainz(`recording/${recording.id}`)}
          className="flex min-h-12 items-center justify-center text-on-background/45 transition-colors hover:bg-on-background hover:text-surface"
          title="View recording on MusicBrainz"
          aria-label={`View ${recording.title} on MusicBrainz`}
        >
          <span className="material-symbols-outlined text-[18px]">
            open_in_new
          </span>
        </button>
      </div>
    </article>
  );
}

function ReleaseCard({
  release,
  onFindTracks,
}: {
  release: ReleaseResult;
  onFindTracks: (artist: string, release: string) => void;
}) {
  return (
    <article className="flex flex-col border-4 border-on-background bg-background shadow-[5px_5px_0px_0px_rgba(29,28,19,1)] sm:flex-row">
      <div className="flex min-w-0 flex-1 gap-3 p-3 sm:gap-4 sm:p-4">
        <CoverArtwork releaseId={release.id} label={release.title} icon="album" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="bg-on-background px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-surface">
              ALBUM
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-on-background/40">
              {release.score}%_MATCH
            </span>
          </div>
          <h3 className="break-words font-headline text-lg font-black uppercase leading-none tracking-tighter sm:text-2xl">
            {release.title}
          </h3>
          <p className="mt-1 truncate text-[11px] font-black uppercase tracking-tight text-primary sm:text-xs">
            {release.artist || "UNKNOWN_ARTIST"}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-bold uppercase tracking-widest text-on-background/45">
            {release.date && <span>{release.date}</span>}
            {release.country && <span>{release.country}</span>}
            {release.trackCount != null && <span>{release.trackCount}_TRACKS</span>}
            {release.status && <span>{release.status}</span>}
          </div>
        </div>
      </div>
      <div className="grid min-h-12 grid-cols-[1fr_48px] border-t-4 border-on-background sm:w-44 sm:grid-cols-1 sm:grid-rows-2 sm:border-l-4 sm:border-t-0">
        <button
          type="button"
          onClick={() => onFindTracks(release.artist, release.title)}
          className="flex min-h-12 items-center justify-center gap-2 border-r-2 border-on-background px-3 text-[9px] font-black uppercase tracking-widest transition-colors hover:bg-primary hover:text-primary-foreground sm:border-b-2 sm:border-r-0"
        >
          <span className="material-symbols-outlined text-[17px]">queue_music</span>
          FIND_TRACKS
        </button>
        <button
          type="button"
          onClick={() => void openMusicBrainz(`release/${release.id}`)}
          className="flex min-h-12 items-center justify-center gap-2 px-3 text-[9px] font-black uppercase tracking-widest text-on-background/45 transition-colors hover:bg-on-background hover:text-surface"
        >
          <span className="material-symbols-outlined text-[17px]">open_in_new</span>
          <span className="hidden sm:inline">MUSICBRAINZ</span>
        </button>
      </div>
    </article>
  );
}

function ArtistCard({
  artist,
  onFindTracks,
}: {
  artist: ArtistResult;
  onFindTracks: (artist: string) => void;
}) {
  return (
    <article className="grid border-4 border-on-background bg-background shadow-[5px_5px_0px_0px_rgba(29,28,19,1)] sm:grid-cols-[minmax(0,1fr)_176px]">
      <div className="flex min-w-0 gap-3 p-3 sm:p-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center border-2 border-on-background bg-on-background text-surface sm:h-24 sm:w-24">
          <span className="material-symbols-outlined text-[30px] text-surface/55">
            person
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="bg-on-background px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-surface">
              ARTIST
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-on-background/40">
              {artist.score}%_MATCH
            </span>
          </div>
          <h3 className="break-words font-headline text-lg font-black uppercase leading-none tracking-tighter sm:text-2xl">
            {artist.name}
          </h3>
          {artist.disambiguation && (
            <p className="mt-1 text-[10px] font-bold uppercase text-on-background/55">
              {artist.disambiguation}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-bold uppercase tracking-widest text-on-background/45">
            {artist.country && <span>{artist.country}</span>}
            {artist.type_ && <span>{artist.type_}</span>}
            {artist.beginDate && (
              <span>
                {artist.beginDate}
                {artist.endDate ? `—${artist.endDate}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="grid min-h-12 grid-cols-[1fr_48px] border-t-4 border-on-background sm:grid-cols-1 sm:grid-rows-2 sm:border-l-4 sm:border-t-0">
        <button
          type="button"
          onClick={() => onFindTracks(artist.name)}
          className="flex min-h-12 items-center justify-center gap-2 border-r-2 border-on-background px-3 text-[9px] font-black uppercase tracking-widest transition-colors hover:bg-primary hover:text-primary-foreground sm:border-b-2 sm:border-r-0"
        >
          <span className="material-symbols-outlined text-[17px]">queue_music</span>
          FIND_TRACKS
        </button>
        <button
          type="button"
          onClick={() => void openMusicBrainz(`artist/${artist.id}`)}
          className="flex min-h-12 items-center justify-center gap-2 px-3 text-[9px] font-black uppercase tracking-widest text-on-background/45 transition-colors hover:bg-on-background hover:text-surface"
        >
          <span className="material-symbols-outlined text-[17px]">open_in_new</span>
          <span className="hidden sm:inline">MUSICBRAINZ</span>
        </button>
      </div>
    </article>
  );
}

function LabelCard({ label }: { label: LabelResult }) {
  return (
    <article className="grid border-4 border-on-background bg-background shadow-[5px_5px_0px_0px_rgba(29,28,19,1)] sm:grid-cols-[minmax(0,1fr)_176px]">
      <div className="flex min-w-0 gap-3 p-3 sm:p-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center border-2 border-on-background bg-on-background text-surface sm:h-24 sm:w-24">
          <span className="material-symbols-outlined text-[30px] text-surface/55">
            business
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="bg-on-background px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-surface">
              LABEL
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-on-background/40">
              {label.score}%_MATCH
            </span>
          </div>
          <h3 className="break-words font-headline text-lg font-black uppercase leading-none tracking-tighter sm:text-2xl">
            {label.name}
          </h3>
          {label.disambiguation && (
            <p className="mt-1 text-[10px] font-bold uppercase text-on-background/55">
              {label.disambiguation}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-bold uppercase tracking-widest text-on-background/45">
            {label.country && <span>{label.country}</span>}
            {label.type_ && <span>{label.type_}</span>}
            {label.labelCode && <span>LC_{label.labelCode}</span>}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void openMusicBrainz(`label/${label.id}`)}
        className="flex min-h-12 items-center justify-center gap-2 border-t-4 border-on-background px-3 text-[9px] font-black uppercase tracking-widest text-on-background/45 transition-colors hover:bg-on-background hover:text-surface sm:border-l-4 sm:border-t-0"
      >
        <span className="material-symbols-outlined text-[17px]">open_in_new</span>
        MUSICBRAINZ
      </button>
    </article>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading music catalog results">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse gap-3 border-4 border-on-background/25 p-3"
        >
          <div className="h-20 w-20 shrink-0 bg-on-background/12 sm:h-24 sm:w-24" />
          <div className="flex-1 space-y-3 py-1">
            <div className="h-3 w-20 bg-on-background/12" />
            <div className="h-5 w-2/3 bg-on-background/12" />
            <div className="h-3 w-1/3 bg-on-background/12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MusicBrainzSearch({
  initialQuery = "",
  initialArtist = "",
}: MusicBrainzSearchProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [entityType, setEntityType] = useState<EntityType>("recordings");
  const [artistFilter, setArtistFilter] = useState(initialArtist);
  const [releaseFilter, setReleaseFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [results, setResults] = useState<MusicBrainzResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const requestId = useRef(0);
  const lastInitialSearch = useRef<string | null>(null);

  const runSearch = useCallback(async (spec: SearchSpec) => {
    const query = spec.query?.trim() ?? "";
    const artist = spec.artist?.trim() ?? "";
    const release = spec.release?.trim() ?? "";
    const country = spec.country?.trim() ?? "";
    const date = spec.date?.trim() ?? "";

    const id = ++requestId.current;

    if (
      (spec.type === "recordings" && !query && !artist && !release) ||
      (spec.type !== "recordings" && !query)
    ) {
      setLoading(false);
      setResults([]);
      setHasSearched(true);
      setError(
        spec.type === "recordings"
          ? "Enter a song, artist, or album to search."
          : "Enter a catalog name to search.",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setHasSearched(true);

    try {
      const client = getMetadataClient();
      let nextResults: MusicBrainzResult[];

      switch (spec.type) {
        case "artists":
          nextResults = (
            await withCatalogTimeout(client.SearchArtists(query, SEARCH_LIMIT))
          ).result;
          break;
        case "releases":
          nextResults = (
            await withCatalogTimeout(
              client.SearchReleases(
                query,
                artist || undefined,
                SEARCH_LIMIT,
              ),
            )
          ).result;
          break;
        case "labels":
          nextResults = (
            await withCatalogTimeout(client.SearchLabels(query, SEARCH_LIMIT))
          ).result;
          break;
        case "recordings":
          nextResults =
            release || country || date || !query
              ? (
                  await withCatalogTimeout(
                    client.SearchRecordingsCombined(
                      query || undefined,
                      artist || undefined,
                      release || undefined,
                      undefined,
                      country || undefined,
                      date || undefined,
                      undefined,
                      SEARCH_LIMIT,
                    ),
                  )
                ).result
              : (
                  await withCatalogTimeout(
                    client.SearchRecordings(
                      query,
                      artist || undefined,
                      SEARCH_LIMIT,
                    ),
                  )
                ).result;
          break;
      }

      if (id === requestId.current) setResults(nextResults);
    } catch (caught) {
      if (id === requestId.current) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The music catalog did not respond.",
        );
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const query = initialQuery.trim();
    const artist = initialArtist.trim();
    if (!query && !artist) return;

    const initialSearchKey = `${query}\u0000${artist}`;
    if (lastInitialSearch.current === initialSearchKey) return;
    lastInitialSearch.current = initialSearchKey;

    setSearchQuery(query);
    setArtistFilter(artist);
    void runSearch({ type: "recordings", query, artist });
  }, [initialArtist, initialQuery, runSearch]);

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  const selectedOption =
    ENTITY_OPTIONS.find((option) => option.value === entityType) ??
    ENTITY_OPTIONS[0]!;

  const selectEntity = (next: EntityType) => {
    if (next === entityType) return;
    requestId.current += 1;
    setEntityType(next);
    setArtistFilter("");
    setReleaseFilter("");
    setCountryFilter("");
    setDateFilter("");
    setResults([]);
    setError(null);
    setHasSearched(false);
    setLoading(false);
    if (next !== "recordings") setAdvancedOpen(false);
  };

  const findTracks = (artist: string, release?: string) => {
    setEntityType("recordings");
    setSearchQuery("");
    setArtistFilter(artist);
    setReleaseFilter(release ?? "");
    setAdvancedOpen(Boolean(release));
    void runSearch({ type: "recordings", artist, release });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runSearch({
      type: entityType,
      query: searchQuery,
      artist: artistFilter,
      release: releaseFilter,
      country: countryFilter,
      date: dateFilter,
    });
  };

  return (
    <div className="space-y-5">
      <section
        className={cn(
          "z-30 border-4 border-on-background bg-background shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] md:sticky md:top-14",
          advancedOpen ? "relative" : "sticky top-0",
        )}
      >
        <div
          className="grid grid-cols-2 border-b-4 border-on-background sm:grid-cols-4"
          role="tablist"
          aria-label="Music catalog type"
        >
          {ENTITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={entityType === option.value}
              onClick={() => selectEntity(option.value)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 border-on-background px-2 text-[10px] font-black uppercase tracking-widest transition-colors odd:border-r-2 sm:border-r-2 sm:last:border-r-0",
                option.value === "recordings" || option.value === "releases"
                  ? "border-b-2 sm:border-b-0"
                  : "",
                entityType === option.value
                  ? "bg-on-background text-surface"
                  : "hover:bg-surface-container-high",
              )}
            >
              <span className="material-symbols-outlined text-[17px]">
                {option.icon}
              </span>
              {option.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4">
          <div
            className={cn(
              "grid gap-2",
              entityType === "recordings" || entityType === "releases"
                ? "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                : "sm:grid-cols-[minmax(0,1fr)_auto]",
            )}
          >
            <label className="block min-w-0">
              <span className="mb-1 block text-[8px] font-black uppercase tracking-[0.2em] text-on-background/45">
                {selectedOption.label}_QUERY
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={selectedOption.placeholder}
                autoComplete="off"
                className="h-12 w-full border-2 border-on-background bg-transparent px-3 font-headline text-sm font-black uppercase tracking-tight outline-none placeholder:text-on-background/25 focus:bg-surface-container-high"
              />
            </label>

            {(entityType === "recordings" || entityType === "releases") && (
              <label className="block min-w-0">
                <span className="mb-1 block text-[8px] font-black uppercase tracking-[0.2em] text-on-background/45">
                  ARTIST_OPTIONAL
                </span>
                <input
                  type="search"
                  value={artistFilter}
                  onChange={(event) => setArtistFilter(event.target.value)}
                  placeholder="ARTIST_NAME..."
                  autoComplete="off"
                  className="h-12 w-full border-2 border-on-background bg-transparent px-3 font-headline text-sm font-black uppercase tracking-tight outline-none placeholder:text-on-background/25 focus:bg-surface-container-high"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-auto flex h-12 min-w-32 items-center justify-center gap-2 border-2 border-on-background bg-primary px-4 text-[10px] font-black uppercase tracking-widest text-primary-foreground shadow-[3px_3px_0px_0px_rgba(29,28,19,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-40"
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={loading ? { animation: "spin 0.8s linear infinite" } : {}}
              >
                {loading ? "sync" : "manage_search"}
              </span>
              {loading ? "SCANNING" : "LOOKUP"}
            </button>
          </div>

          {entityType === "recordings" && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
                className="flex min-h-9 items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-on-background/50 transition-colors hover:text-on-background"
                aria-expanded={advancedOpen}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {advancedOpen ? "remove" : "add"}
                </span>
                MORE_FILTERS
              </button>
              {advancedOpen && (
                <div className="grid gap-2 border-t-2 border-on-background/15 pt-3 sm:grid-cols-3">
                  <label>
                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-on-background/45">
                      ALBUM
                    </span>
                    <input
                      value={releaseFilter}
                      onChange={(event) => setReleaseFilter(event.target.value)}
                      placeholder="RELEASE_NAME..."
                      className="h-10 w-full border-2 border-on-background/35 bg-transparent px-2 font-mono text-[10px] uppercase outline-none focus:border-on-background"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-on-background/45">
                      COUNTRY
                    </span>
                    <input
                      value={countryFilter}
                      onChange={(event) =>
                        setCountryFilter(event.target.value.toUpperCase())
                      }
                      placeholder="US / GB / AT"
                      maxLength={2}
                      className="h-10 w-full border-2 border-on-background/35 bg-transparent px-2 font-mono text-[10px] uppercase outline-none focus:border-on-background"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-on-background/45">
                      RELEASE_DATE
                    </span>
                    <input
                      value={dateFilter}
                      onChange={(event) => setDateFilter(event.target.value)}
                      placeholder="YYYY / YYYY-MM-DD"
                      className="h-10 w-full border-2 border-on-background/35 bg-transparent px-2 font-mono text-[10px] uppercase outline-none focus:border-on-background"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </form>
      </section>

      <div className="flex items-center gap-3 border-b-2 border-on-background/20 pb-2">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">
          {loading
            ? "QUERY_IN_FLIGHT"
            : error
              ? "LOOKUP_FAILED"
              : hasSearched
                ? `${results.length}_${entityType.toUpperCase()}_FOUND`
                : "READY_FOR_INPUT"}
        </span>
        <div className="h-1 flex-1 bg-on-background/15" />
        <span className="hidden text-[8px] font-black uppercase tracking-widest text-on-background/35 sm:block">
          METADATA_BY_MUSICBRAINZ
        </span>
      </div>

      <div aria-live="polite">
        {loading && <SearchSkeleton />}

        {!loading && error && (
          <div className="flex items-start gap-3 border-4 border-destructive bg-destructive/5 p-4 text-destructive">
            <span className="material-symbols-outlined text-[22px]">error</span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest">
                LOOKUP_INTERRUPTED
              </p>
              <p className="mt-1 text-[11px] font-bold">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && hasSearched && results.length === 0 && (
          <div className="border-4 border-on-background/25 p-8 text-center">
            <span className="material-symbols-outlined text-[34px] text-on-background/25">
              search_off
            </span>
            <p className="mt-2 font-headline text-lg font-black uppercase tracking-tighter">
              NO_CATALOG_MATCH
            </p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-on-background/45">
              TRY_FEWER_WORDS_OR_ADD_AN_ARTIST
            </p>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="space-y-3">
            {results.map((result) => {
              switch (result.type) {
                case "recording":
                  return <RecordingCard key={result.id} recording={result} />;
                case "release":
                  return (
                    <ReleaseCard
                      key={result.id}
                      release={result}
                      onFindTracks={findTracks}
                    />
                  );
                case "artist":
                  return (
                    <ArtistCard
                      key={result.id}
                      artist={result}
                      onFindTracks={findTracks}
                    />
                  );
                case "label":
                  return <LabelCard key={result.id} label={result} />;
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
}
