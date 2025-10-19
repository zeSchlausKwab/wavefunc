import { createFileRoute } from "@tanstack/react-router";
import { StationView } from "../components/StationView";
import { PostView } from "../components/PostView";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    search: (search.search as string) || "",
  }),
  component: Index,
});

function Index() {
  const { search } = Route.useSearch();

  return (
    <>
      <StationView searchQuery={search} />
      <div className="mt-8">
        <PostView />
      </div>
    </>
  );
}
