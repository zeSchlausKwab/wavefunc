import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { useStationCount, useStationsObserver } from "../lib/nostr/hooks/useStations";
import { GENRE_INDEX_PAGE_SIZE, genresPath, normalizeGenreQuery, parseGenrePage } from "../lib/genres";
import { loadDirectory } from "../lib/publicDirectory";
import { useFilterStore } from "../stores/filterStore";

export const Route = createFileRoute("/browse/genres")({
  validateSearch: (search): { page?: number; q?: string } => {
    const page = parseGenrePage(search.page);
    if (!page || (search.q !== undefined && typeof search.q !== "string")) return { page: 0 };
    return { page: page > 1 ? page : undefined, q: normalizeGenreQuery(search.q) || undefined };
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1, query: search.q ?? "" }),
  loader: ({ deps, abortController }) => {
    const path = genresPath(deps.page, deps.query);
    return deps.page ? loadDirectory(path, abortController.signal) : { kind: "not-found" as const, path };
  },
  staleTime: 60_000,
  component: BrowseGenres,
});

const tabs = { genres: "graphic_eq", languages: "translate", countries: "public" } as const;
type Tab = keyof typeof tabs;

function BrowseGenres() {
  const [tab, setTab] = useState<Tab>("genres");
  return (
    <main className="space-y-6">
      <div className="flex border-4 border-on-background">
        {(Object.keys(tabs) as Tab[]).map(item => (
          <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}
            className={`flex-1 border-r-4 last:border-r-0 border-on-background py-3 font-black uppercase tracking-tight text-[11px] sm:text-sm flex items-center justify-center gap-1.5 ${tab === item ? "bg-on-background text-surface" : "hover:bg-surface-container-high"}`}>
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{tabs[item]}</span>
            <span>{item}</span>
          </button>
        ))}
      </div>
      {tab === "genres" ? <GenreIndex /> : <RegionalFilters key={tab} tab={tab} />}
    </main>
  );
}

function FilterSearch({ label, query, onChange }: { label: string; query: string; onChange: (value: string) => void }) {
  return <input type="search" aria-label={label} placeholder={label} value={query} onChange={e => onChange(e.target.value)}
    className="w-full border-2 border-on-background bg-surface-container-low px-4 py-2.5 font-bold text-sm focus:outline-none focus:border-primary" />;
}

function GenreIndex() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const { q = "" } = Route.useSearch();
  const [query, setQuery] = useState(q);
  useEffect(() => setQuery(q), [q]);
  if (result.kind !== "genres") return <>
    <SectionHeader as="h1">Radio genres</SectionHeader>
    {result.kind === "not-found" ? <p>Genre directory page not found. <Link to="/browse/genres" search={{}} className="underline">Browse all genres</Link></p> :
      <div><p>The genre directory is temporarily unavailable.</p>
        <button className="mt-3 font-bold underline" onClick={() => router.invalidate()}>Try again</button></div>}
  </>;
  const { total, genres, page } = result;
  const pages = Math.ceil(total / GENRE_INDEX_PAGE_SIZE);
  const pageSearch = (number: number) => ({ page: number > 1 ? number : undefined, q: result.query || undefined });
  return <>
    <SectionHeader as="h1" label={`${total.toLocaleString()} genres`}>Radio genres</SectionHeader>
    <form action="/browse/genres" method="get" className="flex gap-2" onSubmit={e => {
      e.preventDefault();
      navigate({ search: { q: normalizeGenreQuery(query) || undefined } });
    }}>
      <input type="search" name="q" aria-label="Search genres" placeholder="Search genres" maxLength={128} value={query} onChange={e => setQuery(e.target.value)}
        className="min-w-0 flex-1 border-2 border-on-background bg-surface-container-low px-4 py-2.5 font-bold text-sm focus:border-primary" />
      <button className="border-2 border-on-background px-4 py-2 font-bold">Search</button>
      {q && <Link to="/browse/genres" search={{}} className="self-center font-bold underline">Clear</Link>}
    </form>
    {genres.length ? <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {genres.map(genre => <li key={genre.slug}>
          <Link to="/genre/$slug" params={{ slug: genre.slug }}
            className="flex h-full min-h-12 items-baseline justify-between gap-2 border-2 border-on-background bg-surface-container-low px-3 py-2 hover:bg-secondary-fixed-dim focus-visible:underline">
            <span className="min-w-0 break-words font-black">{genre.name}</span>
            <span className="shrink-0 text-xs font-bold">{genre.count.toLocaleString()} {genre.count === 1 ? "station" : "stations"}</span>
          </Link>
        </li>)}
      </ul> : <p>{result.query ? "No genres match your search." : "No radio genres are available yet."}</p>}
    {pages > 1 && <nav aria-label="Genre pages" className="flex flex-wrap items-center justify-between gap-4">
      {page > 1 && <Link to="/browse/genres" search={pageSearch(page - 1)} className="font-bold underline">Previous page</Link>}
      <span>Page {page} of {pages}</span>
      {page < pages && <Link to="/browse/genres" search={pageSearch(page + 1)} className="font-bold underline">Next page</Link>}
    </nav>}
  </>;
}

function RegionalFilters({ tab }: { tab: "languages" | "countries" }) {
  const navigate = useNavigate();
  const { setLanguages, setCountries } = useFilterStore();
  const { events, eose } = useStationsObserver({ limit: 500 });
  const totalStations = useStationCount();
  const [query, setQuery] = useState("");
  const counts = new Map<string, number>();
  for (const station of events) {
    const values = tab === "languages" ? station.languages : [station.countryCode || ""];
    for (const value of values) {
      if (!value) continue;
      const item = tab === "countries" ? value.toUpperCase() : value.toLowerCase();
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }
  const matches = Array.from(counts).filter(([item]) => item.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b[1] - a[1]);
  const select = (item: string) => {
    if (tab === "languages") setLanguages([item]);
    else setCountries([item]);
    navigate({ to: "/", search: {} });
  };
  return <>
    <SectionHeader as="h1" label={eose && counts.size ? `${matches.length}/${counts.size}` : undefined}>
      {tab === "languages" ? "Transmission languages" : "Broadcast regions"}
    </SectionHeader>
    {eose && totalStations !== null && events.length < totalStations && (
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/60">
        Counts from {events.length.toLocaleString()} of {totalStations.toLocaleString()} sampled stations
      </p>
    )}
    {eose && counts.size > 0 && <FilterSearch label={`Search ${tab}`} query={query} onChange={setQuery} />}
    {!eose ? <p>Loading {tab}…</p> : matches.length ? (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        {matches.map(([item, count]) => <button key={item} onClick={() => select(item)}
          className="aspect-square bg-surface-container-high border-2 border-on-background flex flex-col items-center justify-center relative group overflow-hidden hover:bg-on-background hover:text-surface">
          <span className="text-4xl sm:text-5xl font-black leading-none uppercase">{item}</span>
          <span className="absolute bottom-2 left-2 right-2 flex justify-between items-end text-[10px] font-bold uppercase">
            <span>Stations</span><span>{count}</span>
          </span>
        </button>)}
      </div>
    ) : <p>No {tab} found.</p>}
  </>;
}
