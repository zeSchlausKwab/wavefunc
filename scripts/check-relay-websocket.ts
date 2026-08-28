const relayUrl = process.argv[2] ?? "ws://127.0.0.1:3334/";
const timeoutMs = Number(process.env.RELAY_HEALTH_TIMEOUT_MS ?? 10_000);
const subscriptionId = `wavefunc-health-${Date.now()}`;
const impossibleEventId = "0".repeat(64);

type HealthResult =
  | { ok: true; responseType: "EVENT" | "EOSE" }
  | { ok: false; message: string };

const startedAt = Date.now();

const result = await new Promise<HealthResult>((resolve) => {
  let settled = false;
  const socket = new WebSocket(relayUrl);

  const finish = (healthResult: HealthResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (socket.readyState === WebSocket.OPEN) {
      socket.close(1000, "health check complete");
    }
    resolve(healthResult);
  };

  const timeout = setTimeout(() => {
    finish({ ok: false, message: `timed out after ${timeoutMs}ms` });
  }, timeoutMs);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify([
      "REQ",
      subscriptionId,
      { ids: [impossibleEventId], limit: 1 },
    ]));
  });

  socket.addEventListener("message", (event) => {
    let message: unknown;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      finish({ ok: false, message: "relay returned a non-JSON WebSocket message" });
      return;
    }

    if (!Array.isArray(message) || message[1] !== subscriptionId) return;

    if (message[0] === "EVENT" || message[0] === "EOSE") {
      finish({ ok: true, responseType: message[0] });
      return;
    }

    if (message[0] === "CLOSED") {
      finish({ ok: false, message: `subscription closed: ${String(message[2] ?? "")}` });
    }
  });

  socket.addEventListener("error", () => {
    finish({ ok: false, message: "WebSocket connection failed" });
  });

  socket.addEventListener("close", (event) => {
    if (!settled) {
      finish({
        ok: false,
        message: `connection closed before EOSE (code=${event.code}, reason=${event.reason || "none"})`,
      });
    }
  });
});

const elapsedMs = Date.now() - startedAt;
if (!result.ok) {
  console.error(`Relay health check failed for ${relayUrl}: ${result.message} (${elapsedMs}ms)`);
  process.exit(1);
}

console.log(`Relay health check passed for ${relayUrl}: ${result.responseType} (${elapsedMs}ms)`);
