import { createFileRoute } from "@tanstack/react-router";
import { StationView } from "../components/StationView";
import { FeaturedLists } from "../components/FeaturedLists";
import { useFilterStore } from "../stores/filterStore";

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
      {showFeatured && <FeaturedLists />}
      <StationView searchQuery={search || ""} />
    </>
  );
}
