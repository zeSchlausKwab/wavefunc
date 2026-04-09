// NIP-47 Nostr Wallet Connect — applesauce-native pay_invoice flow.
//
// Implements just enough of NIP-47 to pay a BOLT11 invoice:
//   1. Parse the `nostr+walletconnect://` URI
//   2. Build a kind 23194 request with NIP-04 encrypted JSON-RPC content
//   3. Publish the request to the NWC relay via the runtime RelayPool
//   4. Subscribe to the matching kind 23195 response and decrypt the result
//
// No dependency on NDK or any external NWC SDK.

import { EventFactory } from "applesauce-core";
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import type { RelayPool } from "applesauce-relay";
import { PrivateKeySigner } from "applesauce-signers";
import { filter as rxFilter, firstValueFrom, take, timeout } from "rxjs";

export type NWCConnection = {
  walletPubkey: string;
  relay: string;
  secret: string;
};

const URI_SCHEME = "nostr+walletconnect://";

export function parseNWCConnectionString(uri: string): NWCConnection {
  const trimmed = uri.trim();
  if (!trimmed.toLowerCase().startsWith(URI_SCHEME)) {
    throw new Error("Invalid NWC connection string (missing scheme)");
  }

  const body = trimmed.slice(URI_SCHEME.length);
  const [walletPubkey, queryString = ""] = body.split("?");

  if (!walletPubkey) {
    throw new Error("NWC connection string missing wallet pubkey");
  }

  const params = new URLSearchParams(queryString);
  const relay = params.get("relay");
  const secret = params.get("secret");

  if (!relay) throw new Error("NWC connection string missing relay");
  if (!secret) throw new Error("NWC connection string missing secret");

  return { walletPubkey, relay, secret };
}

export type NWCPayInvoiceResult = {
  preimage: string;
  fees_paid?: number;
};

type NWCResponseBody = {
  result_type?: string;
  result?: NWCPayInvoiceResult;
  error?: { code: string; message: string };
};

/**
 * Pay a BOLT11 invoice via the connected NWC wallet.
 *
 * @param connection parsed NWC connection details (from parseNWCConnectionString)
 * @param invoice BOLT11 invoice to pay
 * @param relayPool the applesauce RelayPool from the runtime context
 * @param options.timeoutMs how long to wait for the NWC response (default 60s)
 */
export async function nwcPayInvoice(
  connection: NWCConnection,
  invoice: string,
  relayPool: RelayPool,
  { timeoutMs = 60_000 }: { timeoutMs?: number } = {},
): Promise<NWCPayInvoiceResult> {
  const signer = PrivateKeySigner.fromKey(connection.secret);
  const clientPubkey = await signer.getPublicKey();

  const payload = JSON.stringify({
    method: "pay_invoice",
    params: { invoice },
  });
  const encryptedContent = await signer.nip04.encrypt(
    connection.walletPubkey,
    payload,
  );

  const factory = new EventFactory({ signer });
  const draft: EventTemplate = {
    kind: 23194,
    content: encryptedContent,
    tags: [["p", connection.walletPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  };

  const stamped = await factory.build(draft);
  const requestEvent = await factory.sign(stamped);

  // Set up the response subscription BEFORE publishing so there's no race
  // between the wallet service responding and our subscriber attaching.
  const since = Math.floor(Date.now() / 1000) - 60;
  const responsePromise = firstValueFrom(
    relayPool
      .subscription(
        [connection.relay],
        [
          {
            kinds: [23195],
            "#e": [requestEvent.id],
            "#p": [clientPubkey],
            since,
          },
        ],
      )
      .pipe(
        rxFilter((msg): msg is NostrEvent => typeof msg !== "string"),
        take(1),
        timeout({
          first: timeoutMs,
          with: () => {
            throw new Error("NWC response timed out");
          },
        }),
      ),
  );

  await relayPool.publish([connection.relay], requestEvent);

  const responseEvent = await responsePromise;

  const decrypted = await signer.nip04.decrypt(
    connection.walletPubkey,
    responseEvent.content,
  );

  let parsed: NWCResponseBody;
  try {
    parsed = JSON.parse(decrypted) as NWCResponseBody;
  } catch {
    throw new Error("NWC response content was not valid JSON");
  }

  if (parsed.error) {
    throw new Error(
      `NWC error (${parsed.error.code}): ${parsed.error.message}`,
    );
  }

  if (!parsed.result?.preimage) {
    throw new Error("NWC response missing preimage");
  }

  return parsed.result;
}
