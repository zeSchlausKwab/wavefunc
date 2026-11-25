import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import { PublicStationList } from "../components/PublicStationList";
import { useFavoriteStations } from "../lib/hooks/useFavorites";
import { useProfile } from "../lib/nostr/auth";
import { parseFavoritesListEvent } from "../lib/nostr/domain/favorites-list";
import { loadDirectory } from "../lib/publicDirectory";
import { describePublicPage, publicWebUrl, type PublicPage } from "../lib/publicPageMetadata";

export const Route = createFileRoute("/collection/$naddr")({
  loader: ({ params, abortController }) =>
    loadDirectory("/collection/" + encodeURIComponent(params.naddr), abortController.signal),
  staleTime: 60_000,
  component: CollectionRoute,
});

function CollectionRoute() {
  const page = Route.useLoaderData();
  const router = useRouter();
  if (page.kind === "collection") return <Collection page={page} />;
  return <main className="mx-auto max-w-4xl space-y-4">
    <h1 className="font-headline text-3xl font-black">{page.kind === "not-found" ? "Collection not found" : "Collection temporarily unavailable"}</h1>
    {page.kind === "unavailable" && <button className="font-bold underline" onClick={() => router.invalidate()}>Try again</button>}
    <Link className="block underline" to="/">Browse radio stations</Link>
  </main>;
}

function Collection({ page }: { page: Extract<PublicPage, { kind: "collection" }> }) {
  const list = useMemo(() => parseFavoritesListEvent(page.event), [page.event]);
  const { stations, isLoading } = useFavoriteStations(list);
  const events = useMemo(() => stations.map(station => station.event), [stations]);
  const profile = useProfile(list.pubkey);
  const curator = profile?.display_name || profile?.name || list.pubkey.slice(0, 12) + "…";
  const artwork = publicWebUrl(list.banner) || publicWebUrl(list.image);
  const count = new Set(list.stationAddresses).size;
  const { heading } = describePublicPage(page);
  return <main className="mx-auto w-full max-w-4xl space-y-5">
    <header className="border-4 border-on-background bg-surface-container-low">
      {artwork && <img src={artwork} alt="" className="max-h-52 w-full border-b-4 border-on-background object-cover" />}
      <div className="space-y-3 p-4 md:p-6">
        <h1 className="font-headline text-4xl font-black tracking-tight [overflow-wrap:anywhere]">{heading}</h1>
        <p>Curated by <Link to="/profile/$pubkey" params={{ pubkey: list.pubkey }} className="font-bold underline">{curator}</Link> · {count} {count === 1 ? "station" : "stations"}</p>
        {typeof list.description === "string" && list.description && <p className="whitespace-pre-line [overflow-wrap:anywhere]">{list.description}</p>}
      </div>
    </header>
    {!!events.length && <PublicStationList events={events} playLabel="Play collection" />}
    {isLoading && !events.length && <p role="status">Loading stations…</p>}
    {!isLoading && !count && <p>This collection has no stations yet.</p>}
    {!isLoading && count > events.length && <p role="status">{events.length} of {count} stations available.</p>}
  </main>;
}
