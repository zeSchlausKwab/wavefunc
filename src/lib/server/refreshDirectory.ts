import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import type { NostrEvent } from "nostr-tools/pure";
import { directoryPath, DIRECTORY_REFRESH_MS, importStations } from "./directoryIndex";

export const exporterPath = () => process.env.PUBLIC_DIRECTORY_EXPORTER ?? resolve("relay/relay");
const lmdbPath = () => process.env.PUBLIC_DIRECTORY_LMDB ?? resolve("data/events");

async function* exportStations() {
  const child = spawn(exporterPath(), ["--export-stations", "--db-path", lmdbPath()], { stdio: ["ignore", "pipe", "inherit"] });
  const closed = new Promise<number | null>(resolve => {
    child.once("error", () => resolve(null));
    child.once("close", resolve);
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of lines) yield JSON.parse(line) as NostrEvent;
    const code = await closed;
    if (code !== 0) throw new Error("Station exporter exited with status " + code);
  } finally {
    lines.close();
    if (child.exitCode === null) child.kill();
    await closed;
  }
}

/** Run off the HTTP event loop. SQLite commits only after the exporter has closed successfully. */
export function scheduleDirectoryRefresh(lastCompleted: () => number) {
  let running = false;
  async function tick() {
    if (running || Date.now() - lastCompleted() < DIRECTORY_REFRESH_MS || !existsSync(exporterPath())) return;
    running = true;
    try {
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "refreshDirectory.ts")], { stdout: "inherit", stderr: "inherit" });
      if (await child.exited !== 0) console.warn("Station directory refresh failed; retrying on the next check.");
    } catch (error) {
      console.error("Could not start station directory refresh", error);
    } finally {
      running = false;
    }
  }
  void tick();
  setInterval(() => void tick(), 5 * 60_000).unref();
}

if (import.meta.main) {
  const result = await importStations(directoryPath(), exportStations());
  console.log("Refreshed station directory:", result);
}
