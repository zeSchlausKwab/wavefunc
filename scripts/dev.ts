import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertPortAvailable, DevProcesses, waitUntilReady } from "./lib/dev-processes";

import { setupAndroidReverse } from "./lib/android-reverse";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const count = args.find(arg => !arg.startsWith("--")) ?? "100";
if (!/^\d+$/.test(count) || args.some(arg => arg.startsWith("--") && !["--fake", "--no-seed", "--tauri", "--android"].includes(arg))) {
  throw new Error("Usage: bun scripts/dev.ts [station-count] [--fake | --no-seed] [--tauri | --android]");
}

if (args.includes("--tauri") && args.includes("--android")) throw new Error("Choose desktop or Android development");
const android = args.includes("--android");
const devEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", APP_STAGE: "development", RELAY_URL: "ws://127.0.0.1:3334" };
const services = new DevProcesses({
  cwd: root,
  stdio: "inherit",
  env: devEnv,
});
let interrupted = false;
const interrupt = () => {
  interrupted = true;
  services.cancel(new Error("Development session interrupted"));
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
let buildDir: string | undefined;
let androidSession: Awaited<ReturnType<typeof setupAndroidReverse>> | undefined;
try {
  await assertPortAvailable(3334);
  await assertPortAvailable(3000);
  if (android) androidSession = await setupAndroidReverse(services.signal);
  if (androidSession) { devEnv.ANDROID_SERIAL = androidSession.serial; devEnv.TAURI_DEV_HOST = "127.0.0.1"; }
  buildDir = await mkdtemp(join(tmpdir(), "wavefunc-dev-"));
  const relay = join(buildDir, "wavefunc-relay");
  console.log("Building relay; existing data is preserved. Ctrl+C stops this session's services.");
  await services.run("Relay build", ["go", "-C", join(root, "relay"), "build", "-o", relay, "."]);
  // Run the binary directly so compiler exit cannot orphan the relay.
  services.start("Relay", [relay, "--host", "127.0.0.1", "--port", "3334", "--db-path", join(root, "relay/data/events"), "--search-path", join(root, "relay/data/search")]);
  await waitUntilReady(async signal => {
    try {
      const response = await fetch("http://127.0.0.1:3334", { headers: { Accept: "application/nostr+json" }, signal });
      const info = await response.json();
      return response.ok && typeof info === "object" && info !== null && "supported_nips" in info;
    } catch { signal.throwIfAborted(); return false; }
  }, services.signal);
  if (!args.includes("--no-seed")) {
    await services.run("Station import", args.includes("--fake")
      ? [process.execPath, "scripts/seed.ts"]
      : [process.execPath, "scripts/migrate_legacy.ts", count, "--relay=ws://127.0.0.1:3334"]);
  }
  services.start("ContextVM", [process.execPath, "contextvm/server.ts"]);
  if (androidSession) {
    await services.run("Android", [process.execPath, "run", "tauri", "android", "dev"]);
  } else await services.run(args.includes("--tauri") ? "Tauri" : "Frontend", args.includes("--tauri")
    ? [process.execPath, "run", "tauri", "dev"]
    : [process.execPath, "--hot", "src/index.tsx"]);
} catch (error) {
  if (!interrupted) { console.error(error); process.exitCode = 1; }
} finally {
  await services.stop();
  await androidSession?.cleanup();
  if (buildDir) await rm(buildDir, { recursive: true, force: true });
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
}
