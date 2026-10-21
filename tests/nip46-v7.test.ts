import { describe, expect, test } from "bun:test";
import { NostrConnectSigner, PrivateKeySigner } from "applesauce-signers";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { NEVER, Observable } from "rxjs";

const remote = PrivateKeySigner.fromKey("7".repeat(64));
const remotePubkey = await remote.getPublicKey();

async function response(client: NostrConnectSigner, result: string, id = "connect") {
  return remote.signEvent({
    kind: 24133, created_at: Math.floor(Date.now() / 1000),
    tags: [["p", client.clientPubkey]],
    content: await remote.nip44.encrypt(client.clientPubkey, JSON.stringify({ id, result })),
  });
}

describe("NIP-46 v7 compatibility", () => {
  test("QR pairing requires its secret echo, and a later abort leaves the paired signer open", async () => {
    let active = 0;
    const client = new NostrConnectSigner({
      relays: ["wss://signer.example"], connectSecret: "fixture-pairing-secret",
      subscriptionMethod: () => new Observable(() => { active++; return () => { active--; }; }),
      publishMethod: async () => undefined,
    });
    const controller = new AbortController();
    try {
      const waiting = client.waitForSigner(controller.signal);
      await client.handleEvent(await response(client, "ack"));
      expect(client.isConnected).toBe(false);
      expect(client.remote).toBeUndefined();
      await client.handleEvent(await response(client, "wrong-secret"));
      expect(client.isConnected).toBe(false);
      await client.handleEvent(await response(client, client.connectSecret));
      await waiting;
      expect(client.remote).toBe(remotePubkey);
      controller.abort();
      expect(client.isConnected).toBe(true);
      expect(active).toBe(1);
    } finally { await client.close(); }
    expect(active).toBe(0);
  });

  test("bunker authentication sends its own secret and accepts ack", async () => {
    let params: string[] = [];
    const client = new NostrConnectSigner({
      remote: remotePubkey, relays: ["wss://signer.example"],
      connectSecret: "qr-only", bunkerSecret: "bunker-only", timeout: 500,
      subscriptionMethod: () => NEVER,
      publishMethod: async (_relays, event: NostrEvent) => {
        const request = JSON.parse(await remote.nip44.decrypt(event.pubkey, event.content));
        expect(request.method).toBe("connect");
        params = request.params;
        await client.handleEvent(await response(client, "ack", request.id));
      },
    });
    try {
      expect(await client.connect()).toBe("ack");
      expect(params[1]).toBe("bunker-only");
      expect(client.connectSecret).toBe("qr-only");
      expect(client.isConnected).toBe(true);
    } finally { await client.close(); }
  });

  test("unanswered bunker requests time out and close the listener", async () => {
    let active = 0;
    const client = new NostrConnectSigner({
      remote: remotePubkey, relays: ["wss://signer.example"], timeout: 25,
      subscriptionMethod: () => new Observable(() => { active++; return () => { active--; }; }),
      publishMethod: async () => undefined,
    });
    try {
      await expect(client.connect()).rejects.toThrow("did not respond");
      expect(client.listening).toBe(false);
      expect(active).toBe(0);
    } finally { await client.close(); }
  });
});
