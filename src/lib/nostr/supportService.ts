import type { Filter, NostrEvent } from 'nostr-tools';
import { firstValueFrom, fromEvent, takeUntil, toArray } from 'rxjs';
import type { RelayPool } from 'applesauce-relay';
import { platformFetch } from '../platformFetch';
import { encodeLnurl, lightningEndpoint, type SupportProvider } from './support';

export type SupportEndpoint = SupportProvider & { callback: string; minSendable: number; maxSendable: number; allowsNostr: boolean };
export async function loadSupportEndpoint(address: string, signal?: AbortSignal): Promise<SupportEndpoint> {
  const endpoint = lightningEndpoint(address);
  const response = await platformFetch(endpoint, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Lightning service returned ${response.status}`);
  const data = await response.json();
  if (data.status === 'ERROR') throw new Error(data.reason || 'Lightning service unavailable');
  if (typeof data.callback !== 'string' || new URL(data.callback).protocol !== 'https:') throw new Error('Invalid Lightning callback');
  if (!Number.isSafeInteger(data.minSendable) || !Number.isSafeInteger(data.maxSendable) || data.minSendable < 0 || data.maxSendable < data.minSendable) throw new Error('Invalid Lightning amount limits');
  const allowsNostr = data.allowsNostr === true && typeof data.nostrPubkey === 'string' && /^[0-9a-f]{64}$/.test(data.nostrPubkey);
  return { callback: data.callback, minSendable: data.minSendable, maxSendable: data.maxSendable, allowsNostr, pubkey: allowsNostr ? data.nostrPubkey : '', lnurl: encodeLnurl(endpoint) };
}

/** Page inclusively across timestamp boundaries; enlarge tied pages instead of
 * silently skipping receipts sharing a second. Bounded work exposes partial data. */
export async function loadSupportHistory(
  request: (filter: Filter) => Promise<NostrEvent[]>, filter: Filter, signal: AbortSignal,
  emit: (events: NostrEvent[]) => void, boundary = Math.floor(Date.now()/1000),
): Promise<boolean> {
  let until = boundary, limit = 200;
  const seen = new Set<string>();
  for (let page = 0; page < 100; page++) {
    signal.throwIfAborted();
    const events = await request({ ...filter, until, limit });
    signal.throwIfAborted();
    emit(events);
    events.forEach(event => seen.add(event.id));
    if (events.length < limit) return true;
    if (seen.size >= 10_000) return false;
    const oldest = Math.min(...events.map(event => event.created_at));
    if (oldest === until) { if (limit >= 3200) return false; limit *= 2; }
    else { until = oldest; limit = 200; }
  }
  return false;
}

export function supportRelayRequest(pool: RelayPool, relay: string, signal: AbortSignal) {
  return (filter: Filter) => {
    signal.throwIfAborted();
    return firstValueFrom(pool.request([relay], [filter], { waitForAuth: false, timeout: 10_000 }).pipe(takeUntil(fromEvent(signal, 'abort')), toArray()));
  };
}
