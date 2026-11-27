import { createFileRoute, Link } from "@tanstack/react-router";
import { StationView } from "../components/StationView";
import { TopSupporters } from "../components/TopSupporters";
import { FeaturedLists } from "../components/FeaturedLists";
import { useFilterStore } from "../stores/filterStore";
import { SignalCharts } from "../components/SignalCharts";
import { POPULAR_HOME_GENRES } from "../lib/genres";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => {
    const searchQuery = search.search as string;
    // Only include search if it has a value
    return searchQuery ? { search: searchQuery } : {};
  },
  component: Index,
});

function HomeDirectoryFooter() {
  return (
    <section
      aria-labelledby="wavefunc-about-heading"
      className="mt-16 border-4 border-on-background bg-surface-container-high p-5 sm:p-6 shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] space-y-5"
    >
      <div className="flex flex-wrap items-baseline gap-4">
        <h1
          id="wavefunc-about-heading"
          className="font-headline text-xl sm:text-2xl font-black uppercase tracking-tight"
        >
          WaveFunc Radio — Nostr Internet Radio
        </h1>
        <div className="h-1 flex-grow bg-on-background hidden sm:block" />
      </div>

      <p className="max-w-4xl text-sm leading-relaxed text-on-background/80">
        WaveFunc Radio is an open-source <strong>Nostr internet radio</strong> directory and live player indexing 40,000+ stations worldwide as addressable Nostr events (<code className="font-mono text-xs">kind 31237</code>). Stream instantly in your browser without an account, or sign in with Nostr to sync favorite station lists, saved Song Crate tracks, comments, and Lightning or Cashu zaps across Web, the{" "}
        <Link to="/apps" className="font-bold underline decoration-2 hover:text-primary">
          <code>wf</code> terminal UI
        </Link>
        , desktop, and Android.
      </p>

      <div className="space-y-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-on-background/55">
          BROWSE_POPULAR_GENRES
        </div>
        <nav aria-label="Popular internet radio genres" className="flex flex-wrap gap-2">
          {POPULAR_HOME_GENRES.map((genre) => (
            <Link
              key={genre.slug}
              to="/genre/$slug"
              params={{ slug: genre.slug }}
              className="border-2 border-on-background bg-surface px-2.5 py-1 text-xs font-black uppercase tracking-tight hover:bg-on-background hover:text-surface transition-colors"
            >
              {genre.name}
            </Link>
          ))}
          <Link
            to="/browse/genres"
            className="border-2 border-on-background bg-secondary-fixed-dim px-2.5 py-1 text-xs font-black uppercase tracking-tight hover:bg-on-background hover:text-surface transition-colors"
          >
            All Genres →
          </Link>
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t-2 border-on-background/15 pt-4 text-xs font-black uppercase tracking-wider">
        <Link to="/apps" className="underline decoration-2 hover:text-primary">
          Download Terminal (wf), Android &amp; Desktop Apps
        </Link>
        <a
          href="https://github.com/zeSchlausKwab/wavefunc"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-2 hover:text-primary"
        >
          Source Code (GitHub)
        </a>
        <a
          href="https://zapstore.dev/apps/live.wavefunc.app"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-2 hover:text-primary"
        >
          Zapstore
        </a>
      </div>
    </section>
  );
}

function Index() {
  const { search } = Route.useSearch();
  // Featured collections are a "discover" surface — hide them when the
  // user has narrowed the feed (search, or any genre/language/country
  // chip) so the page is just the filtered LATEST_STATIONS list.
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters());
  const showFeatured = !search && !hasActiveFilters;

  return (
    <>
      {showFeatured && <div className="mb-16 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><FeaturedLists /><TopSupporters /></div>}
      {showFeatured && <SignalCharts />}
      <StationView searchQuery={search || ""} />
      {showFeatured && <HomeDirectoryFooter />}
    </>
  );
}
