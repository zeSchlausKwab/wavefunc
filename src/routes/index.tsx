import { createFileRoute } from "@tanstack/react-router";
import { StationView } from "../components/StationView";
import { FeaturedLists } from "../components/FeaturedLists";

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

  return (
    <>
      {/* Only show featured lists on landing page (no search query) */}
      {!search && <FeaturedLists />}
      <StationView searchQuery={search || ""} />
    </>
  );
}
