import { createFileRoute } from "@tanstack/react-router";
import { StationView } from "../components/StationView";
import { TopSupporters } from "../components/TopSupporters";
import { FeaturedLists } from "../components/FeaturedLists";
import { useFilterStore } from "../stores/filterStore";
import { SignalCharts } from "../components/SignalCharts";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => {
    const searchQuery = search.search as string;
    // Only include search if it has a value
    return searchQuery ? { search: searchQuery } : {};
  },
  component: Index,
});

function Index() {
  const { search } = Route.useSearch();
  // Featured collections are a "discover" surface — hide them when the
  // user has narrowed the feed (search, or any genre/language/country
  // chip) so the page is just the filtered LIVE_STATIONS list.
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters());
  const showFeatured = !search && !hasActiveFilters;

  return (
    <>
      {showFeatured && <div className="mb-16 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><FeaturedLists /><TopSupporters /></div>}
      {showFeatured && <SignalCharts />}
      <StationView searchQuery={search || ""} />
    </>
  );
}
