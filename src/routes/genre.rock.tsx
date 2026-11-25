import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { loadDirectory } from "../lib/publicDirectory";
import { parseStationEvent } from "../lib/nostr/domain/station";
import { publicStationPointer } from "../lib/publicPageMetadata";

export const Route = createFileRoute("/genre/rock")({
  loader: ({ abortController }) => loadDirectory("/genre/rock", abortController.signal),
  staleTime: 60_000,
  component: RockDirectory,
});

function RockDirectory() {
  const page = Route.useLoaderData();
  const router = useRouter();
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <Link to="/browse/genres" className="font-bold underline">Browse genres</Link>
      <h1 className="font-headline text-4xl font-black tracking-tight">Rock radio stations</h1>
      {page.kind === "genre" ? (
        page.events.length ? (
          <ul className="divide-y-2 border-2 border-on-background">
            {page.events.map(event => {
              const station = parseStationEvent(event);
              const name = station.name || "Radio station";
              return <li key={event.id}>
                <Link className="flex min-h-12 flex-wrap items-baseline justify-between gap-x-4 px-4 py-3 hover:bg-surface-container-high focus-visible:underline"
                  to="/station/$naddr" params={{ naddr: publicStationPointer(event) }}>
                  <span className="font-bold">{name}</span>
                  <span className="text-sm">{[station.location, station.countryCode].filter(Boolean).join(", ")}</span>
                </Link>
              </li>;
            })}
          </ul>
        ) : <p>No rock stations are available at the moment.</p>
      ) : <div><p>The station directory is temporarily unavailable.</p>
        <button className="mt-3 font-bold underline" onClick={() => router.invalidate()}>Try again</button>
      </div>}
    </main>
  );
}
