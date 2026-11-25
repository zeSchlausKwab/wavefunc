import { Database } from "bun:sqlite";

/** Read the public song fields only. The observer owns migrations and writes. */
export function serveStationTrackHistory(request: Request, databasePath = process.env.OBSERVER_DB_PATH || "data/observer.sqlite") {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!/^31237:[0-9a-f]{64}:.+$/u.test(address) || address.length > 4096) {
    return Response.json({ error: "Invalid station address" }, { status: 400 });
  }

  let database: Database | undefined;
  try {
    database = new Database(databasePath, { readonly: true });
    const tracks = database.query(`
      SELECT title, artist, album, mbid, started_at AS startedAt, last_seen_at AS observedAt
      FROM track_segments
      WHERE station_address = ? AND trim(title) <> ''
        AND lower(trim(title)) <> 'no metadata available'
      ORDER BY last_seen_at DESC, id DESC LIMIT 10
    `).all(address);
    return Response.json({ tracks }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    return Response.json({ error: "Station song history is unavailable" }, { status: 503, headers: { "Retry-After": "30" } });
  } finally {
    database?.close();
  }
}
