import { describe, expect, test } from "bun:test";
import { RelayLiveness, RelayPool } from "applesauce-relay";
import { PrivateKeySigner } from "applesauce-signers";
import { firstValueFrom, lastValueFrom, filter, toArray } from "rxjs";
import type { ServerWebSocket } from "bun";
import { publishAccepted, relayAuthentication, withRelayAuthentication } from "../src/lib/nostr/transport";

function relay(mode: "accept" | "reject" | "auth" | "deny-auth") {
  const authenticated: string[] = [];
  const frames: unknown[][] = [];
  const server = Bun.serve<{ authenticated: boolean }>({
    port: 0, hostname: "127.0.0.1",
    fetch(request, server) {
      if (server.upgrade(request, { data: { authenticated: false } })) return;
      return Response.json({ supported_nips: [1, 11, 42, 45] });
    },
    websocket: {
      open(ws) { if (mode.includes("auth")) ws.send(JSON.stringify(["AUTH", "test-challenge"])); },
      message(ws: ServerWebSocket<{ authenticated: boolean }>, data) {
        const frame = JSON.parse(String(data));
        frames.push(frame);
        const [type, id] = frame;
        if (type === "AUTH") {
          authenticated.push(id.pubkey);
          ws.data.authenticated = mode === "auth";
          ws.send(JSON.stringify(["OK", id.id, ws.data.authenticated, ws.data.authenticated ? "" : "restricted: denied"]));
        } else if (type === "EVENT") {
          const allowed = mode === "accept" || (mode === "auth" && ws.data.authenticated);
          ws.send(JSON.stringify(["OK", id.id, allowed, allowed ? "" : mode.includes("auth") ? "auth-required: authenticate" : "blocked: test rejection"]));
        } else if (type === "REQ") {
          ws.send(JSON.stringify(mode === "reject" ? ["CLOSED", id, "restricted: forbidden"] : ["EOSE", id]));
        } else if (type === "COUNT") {
          ws.send(JSON.stringify(mode === "reject" ? ["CLOSED", id, "unsupported: COUNT"] : ["COUNT", id, { count: 0 }]));
        }
      },
    },
  });
  return { url: `ws://127.0.0.1:${server.port}`, server, authenticated, frames };
}
const signer = PrivateKeySigner.fromKey("6".repeat(64));
const event = () => signer.signEvent({ kind: 1, content: "fixture", tags: [], created_at: 1 });

describe("v7 relay boundaries", () => {
  test("empty successful requests differ from every relay refusing the query", async () => {
    const good = relay("accept"); const bad = relay("reject"); const pool = new RelayPool();
    const options = { waitForAuth: false as const, timeout: 500, reconnect: false, resubscribe: false,
      complete: filter((message: { type: string }) => message.type === "EOSE") };
    try {
      expect(await firstValueFrom(pool.request([good.url], [{}], options).pipe(toArray()))).toEqual([]);
      await expect(firstValueFrom(pool.request([bad.url], [{}], options).pipe(toArray()))).rejects.toThrow();
      expect(await firstValueFrom(pool.request([bad.url, good.url], [{}], options).pipe(toArray()))).toEqual([]);
    } finally { pool.close(); good.server.stop(true); bad.server.stop(true); }
  });

  test("COUNT exposes success and failure per relay without treating failure as zero", async () => {
    const good = relay("accept"); const bad = relay("reject"); const pool = new RelayPool();
    try {
      const result = await lastValueFrom(pool.count([good.url, bad.url], [{ kinds: [1] }], undefined, { timeout: 500, retries: false, waitForAuth: false }));
      expect(Object.values(result).find(outcome => outcome.ok)).toMatchObject({ ok: true, value: { count: 0 } });
      expect(Object.values(result).find(outcome => !outcome.ok)).toMatchObject({ ok: false });
    } finally { pool.close(); good.server.stop(true); bad.server.stop(true); }
  });

  test("publication requires at least one accepted verdict, including the wallet policy view", async () => {
    const good = relay("accept"); const bad = relay("reject"); const pool = new RelayPool();
    try {
      const signed = await event();
      await expect(publishAccepted(pool, [bad.url], signed)).rejects.toThrow("test rejection");
      expect((await publishAccepted(pool, [bad.url, good.url], signed)).some(result => result.ok)).toBe(true);
      await expect(publishAccepted(pool, [], signed)).rejects.toThrow("No write relays");
      const walletPool = withRelayAuthentication(pool, signer, await signer.getPublicKey());
      await expect(walletPool.publish([bad.url], signed)).rejects.toThrow("test rejection");
    } finally { pool.close(); good.server.stop(true); bad.server.stop(true); }
  });

  test("AUTH challenges use the captured account and rejected authentication fails", async () => {
    const good = relay("auth"); const bad = relay("deny-auth"); const pool = new RelayPool();
    try {
      const pubkey = await signer.getPublicKey();
      const options = { ...relayAuthentication(signer, pubkey), timeout: 1000, authTimeout: 1000, retries: false };
      expect((await publishAccepted(pool, [good.url], await event(), options))[0]?.ok).toBe(true);
      expect(good.authenticated).toEqual([pubkey]);
      await expect(publishAccepted(pool, [bad.url], await event(), options)).rejects.toThrow();
      expect(bad.authenticated).toEqual([pubkey]);
    } finally { pool.close(); good.server.stop(true); bad.server.stop(true); }
  });

  test("liveness backs off transport failures and explicit retry resets eligibility", () => {
    const liveness = new RelayLiveness();
    liveness.recordFailure("wss://failed.example");
    expect(liveness.isInBackoff("wss://failed.example")).toBe(true);
    expect(liveness.filter(["wss://failed.example", "wss://unknown.example"])).toEqual(["wss://unknown.example"]);
    liveness.reset("wss://failed.example");
    expect(liveness.isInBackoff("wss://failed.example")).toBe(false);
    expect(liveness.getState("wss://failed.example")).toBeUndefined();
    liveness.destroy();
  });
});
