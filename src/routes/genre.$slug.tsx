import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { loadDirectory } from "../lib/publicDirectory";
import { GENRE_PAGE_SIZE, genrePath, parseGenrePage } from "../lib/genres";
import { parseStationEvent } from "../lib/nostr/domain/station";
import { publicStationPointer } from "../lib/publicPageMetadata";

export const Route = createFileRoute("/genre/$slug")({
  validateSearch: (search): { page?: number } =>
    search.page === undefined ? {} : { page: parseGenrePage(search.page) ?? 0 },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ params, deps, abortController }) => {
    const path = genrePath(params.slug, deps.page);
    return deps.page ? loadDirectory(path, abortController.signal) : { kind: "not-found" as const, path };
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
  const { genre, page, events } = result;
  const pages = Math.ceil(genre.count / GENRE_PAGE_SIZE);
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <Link to="/browse/genres" className="font-bold underline">Browse genres</Link>
      <h1 className="font-headline text-4xl font-black tracking-tight [overflow-wrap:anywhere]">{genre.name} radio stations</h1>
      <p>{genre.count.toLocaleString()} {genre.count === 1 ? "station" : "stations"}</p>
      <ul className="divide-y-2 border-2 border-on-background">
        {events.map(event => {
          const station = parseStationEvent(event);
          return <li key={event.id}>
            <Link className="flex min-h-12 flex-wrap items-baseline justify-between gap-x-4 px-4 py-3 hover:bg-surface-container-high focus-visible:underline"
              to="/station/$naddr" params={{ naddr: publicStationPointer(event) }}>
              <span className="font-bold">{station.name || "Radio station"}</span>
              <span className="text-sm">{[station.location, station.countryCode].filter(Boolean).join(", ")}</span>
            </Link>
          </li>;
        })}
      </ul>
      {pages > 1 && <nav aria-label="Station pages" className="flex flex-wrap items-center justify-between gap-4">
        {page > 1 && <Link to="/genre/$slug" params={{ slug: genre.slug }} search={page === 2 ? {} : { page: page - 1 }} className="font-bold underline">Previous page</Link>}
        <span>Page {page} of {pages}</span>
        {page < pages && <Link to="/genre/$slug" params={{ slug: genre.slug }} search={{ page: page + 1 }} className="font-bold underline">Next page</Link>}
      </nav>}
    </main>
  );
}
