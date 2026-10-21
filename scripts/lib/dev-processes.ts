import { spawn, type SpawnOptions } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

/** POSIX development services each own a process group, including descendants
 * such as the Go compiler and Tauri's frontend. Never discover owners by port. */
export class DevProcesses {
  private groups = new Set<number>();
  private stopping = false;
  private controller = new AbortController();
  readonly signal = this.controller.signal;

  constructor(private options: SpawnOptions = {}, private graceMs = 1000) {
    if (process.platform === "win32") throw new Error("Use WSL for the combined development command");
  }

  private launch(name: string, command: string[], service: boolean) {
    this.signal.throwIfAborted();
    const [executable, ...args] = command;
    if (!executable) throw new Error(`Missing command for ${name}`);
    const child = spawn(executable, args, { ...this.options, detached: true });
    const pid = child.pid;
    if (pid && pid > 0) this.groups.add(pid);
    const exited = new Promise<number>((resolve) => {
      child.once("error", (error) => {
        this.controller.abort(new Error(`${name}: ${error.message}`));
        resolve(1);
      });
      child.once("exit", (code, signal) => {
        if (service && !this.stopping) {
          this.controller.abort(new Error(`${name} stopped (${signal ?? code})`));
        }
        // Keep the original process group through cleanup, including descendants.
        if (pid && pid > 0) {
          try { process.kill(-pid, 0); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ESRCH") this.groups.delete(pid);
          }
        }
        resolve(code ?? 1);
      });
    });
    return { child, exited };
  }

  start(name: string, command: string[]) {
    return this.launch(name, command, true).child;
  }

  async run(name: string, command: string[]) {
    const { exited } = this.launch(name, command, false);
    let onAbort: (() => void) | undefined;
    try {
      const code = await Promise.race([
        exited,
        new Promise<never>((_, reject) => {
          onAbort = () => reject(this.signal.reason);
          this.signal.addEventListener("abort", onAbort, { once: true });
          if (this.signal.aborted) onAbort();
        }),
      ]);
      this.signal.throwIfAborted();
      if (code !== 0) throw new Error(`${name} exited with code ${code}`);
    } finally {
      if (onAbort) this.signal.removeEventListener("abort", onAbort);
    }
  }

  cancel(reason: Error) { this.controller.abort(reason); }

  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    this.controller.abort(new Error("Development session stopped"));
    const signalGroup = (pid: number, signal: NodeJS.Signals) => {
      try { process.kill(-pid, signal); return true; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        return false;
      }
    };
    const remaining = [...this.groups].filter(pid => signalGroup(pid, "SIGTERM"));
    if (remaining.length) await delay(this.graceMs);
    for (const pid of remaining) signalGroup(pid, "SIGKILL");
    this.groups.clear();
  }
}

export async function assertPortAvailable(port: number) {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Port ${port} is in use. Stop its owner or use dev:frontend with existing services.`)));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => server.close(error => error ? reject(error) : resolve()));
  });
}

export async function waitUntilReady(check: (signal: AbortSignal) => Promise<boolean>, signal: AbortSignal, timeoutMs = 30_000) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  while (true) {
    deadline.throwIfAborted();
    if (await check(deadline)) {
      deadline.throwIfAborted();
      return;
    }
    await delay(100, undefined, { signal: deadline });
  }
}
