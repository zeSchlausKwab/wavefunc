import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCurrentAccount, useProfile } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { useAppSupport } from "../lib/nostr/hooks/useAppSupport";
import {
  SUPPORT_PUBKEY,
  formatSupportSats,
  supportDecision,
} from "../lib/nostr/support";
import { useUIStore } from "../stores/uiStore";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

function Supporter({
  pubkey,
  msats,
  rank,
}: {
  pubkey: string;
  msats: bigint;
  rank: number;
}) {
  const profile = useProfile(pubkey);
  const name =
    profile?.display_name ||
    profile?.name ||
    `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;
  return (
    <li className="flex items-center gap-3 border-b-2 border-on-background/15 py-5 last:border-b-0">
      <span className="w-5 shrink-0 font-mono text-xs font-black text-on-background/40">
        {String(rank).padStart(2, "0")}
      </span>
      <Link
        to="/profile/$pubkey"
        params={{ pubkey }}
        className="flex min-w-0 flex-1 items-center gap-3 hover:text-primary"
      >
        <Avatar className="size-11 rounded-none border-2 border-on-background">
          <AvatarImage
            src={profile?.picture}
            alt=""
            className="object-cover grayscale"
          />
          <AvatarFallback className="rounded-none font-black">
            {name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-sm font-black" title={name}>
          {name}
        </span>
      </Link>
      <span className="shrink-0 text-right font-mono text-sm font-black tabular-nums">
        {formatSupportSats(msats)}
        <span className="block text-[9px] uppercase tracking-widest text-on-background/50">
          sats
        </span>
      </span>
    </li>
  );
}

export function TopSupporters() {
  const data = useAppSupport();
  const account = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const openSupport = useUIStore((state) => state.openSupport);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const confirm = async (id: string, include: boolean) => {
    if (saving.current || account?.pubkey !== SUPPORT_PUBKEY) return;
    saving.current = true;
    setBusy(id);
    setError(null);
    try {
      await signAndPublish(
        {
          ...supportDecision(id, include),
          created_at: Math.max(
            Math.floor(Date.now() / 1000),
            (data.entries.find((entry) => entry.event.id === id)?.decisionAt ??
              0) + 1,
          ),
        },
        data.relays,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save this decision.",
      );
    } finally {
      saving.current = false;
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby="supporters-title" className="min-w-0 space-y-6">
      <div className="flex min-h-10 items-center gap-3">
        <h2
          id="supporters-title"
          className="bg-on-background px-3 py-1 text-xl font-black uppercase italic text-surface -skew-x-6"
        >
          TOP_SUPPORTERS
        </h2>
        <div className="h-1 flex-1 bg-outline" />
      </div>
      <div className="flex min-h-[480px] flex-col border-4 border-on-background bg-surface-container-low p-5 shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] lg:min-h-[650px]">
        <div className="flex items-start justify-between border-b-4 border-on-background pb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-primary">
              COMMUNITY_POWERED
            </p>
            <p className="mt-2 text-sm font-medium">
              Keeping the signal alive.
            </p>
          </div>
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-3xl"
          >
            bolt
          </span>
        </div>
        {data.loading && data.leaders.length === 0 ? (
          <div
            role="status"
            aria-label="Loading supporters"
            className="my-4 space-y-4"
          >
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-14 animate-pulse bg-on-background/10" />
            ))}
          </div>
        ) : data.leaders.length ? (
          <ol aria-label="Top five app supporters" className="my-1">
            {data.leaders.map((leader, index) => (
              <Supporter key={leader.pubkey} {...leader} rank={index + 1} />
            ))}
          </ol>
        ) : (
          <p className="my-auto py-10 text-sm leading-relaxed text-on-background/60">
            {data.error
              ? "Supporter totals are temporarily unavailable."
              : data.partial
                ? "No confirmed support found in the available receipts."
                : "Be the first confirmed supporter on the board."}
          </p>
        )}
        {(data.error || data.partial) && (
          <div
            role="status"
            className="my-3 text-xs leading-relaxed text-on-background/60"
          >
            <p>
              {data.error ||
                "Some receipt history is unavailable. Totals may be incomplete."}
            </p>
            <button
              type="button"
              onClick={data.retry}
              className="mt-1 font-bold underline"
            >
              Try again
            </button>
          </div>
        )}
        <div className="mt-auto border-t-2 border-on-background/20 pt-5">
          <p className="mb-4 text-[11px] leading-relaxed text-on-background/60">
            Public app-support zaps, including direct profile zaps before 21 Oct
            2026, 08:58 UTC. Anonymous payments are not ranked.
          </p>
          <button
            type="button"
            onClick={openSupport}
            className="w-full border-2 border-on-background bg-secondary-fixed-dim py-3 text-xs font-black uppercase tracking-widest shadow-[3px_3px_0px_0px_rgba(29,28,19,1)] hover:bg-on-background hover:text-surface"
          >
            SUPPORT_WAVEFUNC
          </button>
        </div>
        {account?.pubkey === SUPPORT_PUBKEY && (
          <button
            type="button"
            className="mt-4 text-xs font-bold underline"
            onClick={() => setReview(true)}
          >
            Review past zaps
          </button>
        )}
      </div>
      {account?.pubkey === SUPPORT_PUBKEY && (
        <Dialog open={review} onOpenChange={setReview}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
            <DialogTitle>Confirm app-support zaps</DialogTitle>
            <DialogDescription>
              Only confirm payments you recognize as support for WaveFunc. Each
              decision is published under your receiving account.
            </DialogDescription>
            {error && <p role="alert">{error}</p>}
            {data.entries.length === 0 && (
              <p>No verified receipts available.</p>
            )}
            {data.entries.map((entry) => (
              <div
                key={entry.event.id}
                className="space-y-2 border-b-2 border-on-background/20 py-4"
              >
                <div className="flex justify-between gap-3 text-sm font-bold">
                  <span>
                    {entry.sender
                      ? `${entry.sender.slice(0, 12)}…`
                      : "Anonymous"}
                  </span>
                  <span>{formatSupportSats(entry.msats)} sats</span>
                </div>
                <p className="break-words text-sm">
                  {entry.request.content || "No message"}
                </p>
                <p className="text-xs text-on-background/50">
                  {new Date(entry.event.created_at * 1000).toLocaleDateString()}{" "}
                  ·{" "}
                  {entry.included
                    ? "Included"
                    : entry.reviewed
                      ? "Excluded"
                      : "Not confirmed"}
                </p>
                <div className="flex gap-3">
                  <button
                    disabled={!!busy || entry.included}
                    type="button"
                    onClick={() => confirm(entry.event.id, true)}
                    className="border-2 border-on-background px-3 py-2 text-xs font-bold disabled:opacity-40"
                  >
                    Confirm app support
                  </button>
                  <button
                    disabled={!!busy || (entry.reviewed && !entry.included)}
                    type="button"
                    onClick={() => confirm(entry.event.id, false)}
                    className="border-2 border-on-background px-3 py-2 text-xs disabled:opacity-40"
                  >
                    Exclude
                  </button>
                </div>
              </div>
            ))}
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
