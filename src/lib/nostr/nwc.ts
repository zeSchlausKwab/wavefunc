import type { RelayPool } from "applesauce-relay";
import { PrivateKeySigner } from "applesauce-signers";
import { WalletConnect } from "applesauce-wallet-connect";
import { parseWalletConnectURI } from "applesauce-wallet-connect/helpers";
import { catchError, concatWith, firstValueFrom, merge, mergeMap, NEVER, ReplaySubject, Subject, takeUntil, throwError } from "rxjs";
import { publishAccepted, relayAuthentication } from "./transport";

export type NWCConnection = { walletPubkey: string; relay: string; relays?: string[]; secret: string };

export function parseNWCConnectionString(uri: string): NWCConnection {
  const raw = new URL(uri.trim());
  for (const relay of raw.searchParams.getAll("relay")) {
    if (!["ws:", "wss:"].includes(new URL(relay).protocol)) throw new Error("Invalid NWC relay URL");
  }
  const connection = parseWalletConnectURI(uri.trim());
  if (!/^[a-f0-9]{64}$/i.test(connection.service) || !/^[a-f0-9]{64}$/i.test(connection.secret)) {
    throw new Error("NWC requires a 32-byte wallet public key and connection secret");
  }
  const relays = [...new Set(connection.relays.map(value => {
    const url = new URL(value);
    if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("Invalid NWC relay URL");
    return url.toString().replace(/\/$/, "");
  }))];
  if (!relays.length) throw new Error("NWC connection string missing relay");
  return { walletPubkey: connection.service, secret: connection.secret, relay: relays[0]!, relays };
}

export type NWCPayInvoiceResult = { preimage: string; fees_paid?: number };

/** The SDK owns negotiation, encryption, signing, matching and verification.
 * This adapter owns relay acceptance and releases sockets when a call ends. */
export async function nwcPayInvoice(
  connection: NWCConnection,
  invoice: string,
  pool: RelayPool,
  { timeoutMs = 60_000 }: { timeoutMs?: number } = {},
): Promise<NWCPayInvoiceResult> {
  const signer = PrivateKeySigner.fromKey(connection.secret);
  const auth = relayAuthentication(signer, await signer.getPublicKey());
  const stop = new ReplaySubject<void>(1);
  const failures = new Subject<unknown>();
  const wallet = new WalletConnect({
    secret: Uint8Array.from(connection.secret.match(/.{2}/g)!.map(byte => parseInt(byte, 16))),
    service: connection.walletPubkey,
    relays: connection.relays ?? [connection.relay],
    timeout: timeoutMs,
    acceptRelayHint: false,
    subscriptionMethod: (relays, filters) => pool.subscription(relays, filters, auth).pipe(
      catchError(error => { failures.next(error); return NEVER; }),
      takeUntil(stop),
      // The SDK repeats completed streams. Close the transport without triggering repetition.
      concatWith(NEVER),
    ),
    publishMethod: (relays, event) => publishAccepted(pool, relays, event, auth),
  });
  try {
    const response = await firstValueFrom(merge(
      failures.pipe(mergeMap(error => throwError(() => error))),
      wallet.call("pay_invoice", { invoice }),
    ));
    if (response.result_type !== "pay_invoice") throw new Error("Unexpected NWC response type");
    if (response.error) throw new Error(response.error.message || "Wallet rejected payment");
    if (!response.result?.preimage) throw new Error("Wallet returned no payment preimage");
    return response.result;
  } finally { stop.next(); stop.complete(); failures.complete(); }
}
