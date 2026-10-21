import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assertPortAvailable, DevProcesses, waitUntilReady } from "../scripts/lib/dev-processes";

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Combined development services use POSIX process groups; Windows users run them in WSL.
describe("development process ownership", () => {
  test.skipIf(process.platform === "win32")("stops owned descendants after parent exit and leaves other sessions alive", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wavefunc-process-test-"));
    const pidFile = join(dir, "child.pid");
    const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    const session = new DevProcesses({ stdio: "ignore" }, 100);
    let descendant: number | undefined;
    try {
      const childCode = `process.on('SIGTERM', () => {}); await Bun.write(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
      // Parent exits successfully while its child remains in the owned group.
      await session.run("parent", [process.execPath, "-e", `const {spawn} = require('node:child_process'); spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], {stdio: 'ignore'}).unref();`]);
      await waitUntilReady(async () => {
        try { descendant = Number(await readFile(pidFile, "utf8")); return !!descendant; } catch { return false; }
      }, AbortSignal.timeout(3000));
      expect(alive(descendant!)).toBe(true);
      await session.stop();
      await waitUntilReady(async () => !alive(descendant!), AbortSignal.timeout(3000));
      expect(alive(unrelated.pid!)).toBe(true);
    } finally {
      await session.stop();
      unrelated.kill();
      if (descendant && alive(descendant)) process.kill(descendant, "SIGKILL");
      await rm(dir, { recursive: true, force: true });
    }
  });

  test.skipIf(process.platform === "win32")("a failed service interrupts an in-progress command and cleanup stops it", async () => {
    const session = new DevProcesses({ stdio: "ignore" }, 100);
    try {
      const command = session.run("import", [process.execPath, "-e", "setInterval(() => {}, 1000)"]);
      session.start("relay", [process.execPath, "-e", "process.exit(2)"]);
      await expect(command).rejects.toThrow("relay stopped (2)");
      expect(session.signal.aborted).toBe(true);
    } finally { await session.stop(); }
  });

  test.skipIf(process.platform === "win32")("cancellation stops waiting for a command and missing commands fail promptly", async () => {
    const session = new DevProcesses({ stdio: "ignore" }, 100);
    try {
      const command = session.run("frontend", [process.execPath, "-e", "setInterval(() => {}, 1000)"]);
      session.cancel(new Error("interrupted"));
      await expect(command).rejects.toThrow("interrupted");
    } finally { await session.stop(); }
    const missing = new DevProcesses({ stdio: "ignore" });
    try { await expect(missing.run("build", ["/no-such-wavefunc-command"])).rejects.toThrow("build"); }
    finally { await missing.stop(); }
  });

  test("readiness has a deadline and responds to cancellation", async () => {
    await expect(waitUntilReady(async () => false, new AbortController().signal, 20)).rejects.toThrow();
    const controller = new AbortController();
    const ready = waitUntilReady(async () => false, controller.signal);
    controller.abort(new Error("relay crashed"));
    await expect(ready).rejects.toThrow();
    let attempts = 0;
    await waitUntilReady(async () => ++attempts === 2, new AbortController().signal);
    expect(attempts).toBe(2);
  });

  test("refuses occupied ports without interrupting their owner", async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("existing service") });
    try {
      await expect(assertPortAvailable(server.port!)).rejects.toThrow("is in use");
      if (Bun.which("lsof")) {
        const stop = Bun.spawn(["bash", "scripts/kill-relay.sh", String(server.port)], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
        expect(await stop.exited).toBe(1);
        expect(await new Response(stop.stderr).text()).toContain("Refusing to stop");
      }
      expect(await (await fetch(server.url)).text()).toBe("existing service");
    } finally { server.stop(true); }
    await delay(10);
  });
});
