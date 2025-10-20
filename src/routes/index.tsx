import { createFileRoute } from "@tanstack/react-router";
import { StationView } from "../components/StationView";
import { PostView } from "../components/PostView";

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
      <StationView searchQuery={search || ""} />
      <div className="mt-8">
        <PostView />
      </div>
    </>
  );
}
