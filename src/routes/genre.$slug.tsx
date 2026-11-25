import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { loadDirectory } from "../lib/publicDirectory";
import { genrePath, parseGenrePage } from "../lib/genres";
import { PublicStationList } from "../components/PublicStationList";

export const Route = createFileRoute("/genre/$slug")({
  validateSearch: (search): { page?: number } =>
    search.page === undefined ? {} : { page: parseGenrePage(search.page) ?? 0 },
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ params, deps, abortController }) => {
    const path = genrePath(params.slug, deps.page);
    if (deps.page === 0) return { kind: "not-found" as const, path };
    const result = await loadDirectory(path, abortController.signal);
    if (deps.page !== undefined && result.kind === "genre") {
      throw redirect({ to: "/genre/$slug", params, search: {}, replace: true });
    }
    return result;
  },
  staleTime: 60_000,
  component: GenreDirectory,
});

function GenreDirectory() {
  const result = Route.useLoaderData();
  const router = useRouter();
  if (result.kind !== "genre") {
    return <main className="mx-auto max-w-4xl space-y-5">
      <Link to="/browse/genres" className="font-bold underline">Browse genres</Link>
      <h1 className="font-headline text-4xl font-black">{result.kind === "not-found" ? "Genre page not found" : "Station directory temporarily unavailable"}</h1>
      {result.kind === "unavailable" && <button className="font-bold underline" onClick={() => router.invalidate()}>Try again</button>}
    </main>;
  }
  const { genre, events } = result;
  const description = genre.count > events.length
    ? `Newest ${events.length} of ${genre.count.toLocaleString()} listings`
    : `${genre.count} ${genre.count === 1 ? "station" : "stations"} · Newest first`;
  return <main className="mx-auto max-w-4xl space-y-5">
    <Link to="/browse/genres" className="font-bold underline">Browse genres</Link>
    <h1 className="font-headline text-4xl font-black tracking-tight [overflow-wrap:anywhere]">{genre.name} radio stations</h1>
    <PublicStationList events={events} description={description} playLabel={`Play ${genre.name}`} preferHealthy />
  </main>;
}
