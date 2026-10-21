import { useEffect, useRef, useState } from "react";
import { Subscription } from "rxjs";
import {
  setAccountOptions,
  useAccountOptions,
} from "../../config/accountOptions";
import { getSocialRelayUrls } from "../../config/nostr";
import { relayPool } from "../../lib/nostr/store";
import { relaySuggestions } from "../../lib/nostr/relayDiscovery";
import type { NostrEvent } from "applesauce-core/helpers/event";
export function RelayDiscoverySettings({
  pubkey,
  add,
}: {
  pubkey: string | null;
  add: (url: string) => void;
}) {
  const options = useAccountOptions(pubkey);
  const [suggestions, setSuggestions] = useState<
    ReturnType<typeof relaySuggestions>
  >([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<Subscription | null>(null);
  useEffect(() => () => active.current?.unsubscribe(), [pubkey]);
  const discover = () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const events: NostrEvent[] = [];
    const finish = () => {
      const rows = relaySuggestions(events);
      setSuggestions(rows);
      setBusy(false);
      setMessage(
        rows.length
          ? ""
          : "No recent relays reported by at least two monitors were found.",
      );
    };
    active.current = relayPool
      .request(
        getSocialRelayUrls().slice(0, 3),
        [
          {
            kinds: [30166],
            since: Math.floor(Date.now() / 1000) - 86400,
            limit: 500,
          },
        ],
        { timeout: 6000, waitForAuth: false },
      )
      .subscribe({
        next: (event) => {
          if (events.length < 1500) events.push(event);
        },
        complete: finish,
        error: () => {
          finish();
          setMessage(
            "Discovery is unavailable. Your existing relays still work.",
          );
        },
      });
  };
  return (
    <section className="space-y-3 border-2 border-on-background p-4">
      <h4 className="font-bold">Relay discovery</h4>
      <label className="flex gap-2 text-sm">
        <input
          disabled={!pubkey}
          type="checkbox"
          checked={options.discoverOutboxes}
          onChange={(e) => {
            if (pubkey)
              try {
                setAccountOptions(pubkey, {
                  discoverOutboxes: e.target.checked,
                });
              } catch {
                setMessage("Could not save this preference.");
              }
          }}
        />
        Find community posts on authors’ outboxes
      </label>
      <p className="text-xs">
        Uses published relay lists for up to 100 community participants, with at
        most six extra relays and two per author. These relays can see your
        requests. App data and wallet relays keep their own settings.
      </p>
      <button
        type="button"
        className="underline text-sm"
        disabled={busy}
        onClick={discover}
      >
        {busy ? "Checking monitors…" : "Find relay suggestions"}
      </button>
      <p className="text-xs text-on-background/60">
        Suggestions require reports from two distinct monitors in the past day.
        Monitor claims are advisory; adding a suggestion only edits your draft.
      </p>
      {suggestions.map((row) => (
        <div key={row.url} className="flex gap-3 text-xs items-center">
          <span className="min-w-0 flex-1 break-all">
            {row.url} · {row.monitors} monitors
          </span>
          <button
            type="button"
            disabled={!pubkey}
            className="underline"
            onClick={() => add(row.url)}
          >
            Add to draft
          </button>
        </div>
      ))}
      {message && (
        <p role="status" className="text-xs">
          {message}
        </p>
      )}
    </section>
  );
}
