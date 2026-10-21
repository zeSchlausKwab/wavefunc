import { useEffect } from "react";
import type { IAccount } from "applesauce-accounts";
import { nip19 } from "nostr-tools";
import {
  getAccountOptions,
  useAccountOptions,
} from "../../../config/accountOptions";
import { getSocialRelayUrls } from "../../../config/nostr";
import { usePlayerStore } from "../../../stores/playerStore";
import { useMetadataStore } from "../../../stores/metadataStore";
import { accounts, publishEvent } from "../store";
import {
  ListeningStatusPublisher,
  type ListeningTrack,
} from "../listeningStatus";
import { BehaviorSubject } from "rxjs";
export const listeningStatusError = new BehaviorSubject<string | null>(null);

let sessionGeneration = 0;
export function useListeningStatus(account: IAccount | null | undefined) {
  const { listeningStatus } = useAccountOptions(account?.pubkey ?? null);
  useEffect(() => {
    const session = ++sessionGeneration;
    listeningStatusError.next(null);
    if (!account || !listeningStatus) return;
    const publisher = new ListeningStatusPublisher(
      async (template, current) => {
        const allowed = () => {
          if (accounts.active !== account || !current()) return false;
          const enabled = getAccountOptions(account.pubkey).listeningStatus;
          // The cleanup clear must survive the effect for "disabled" mounting.
          // Re-enabling creates a new session that supersedes that old clear.
          return template.content
            ? enabled && session === sessionGeneration
            : !enabled || session === sessionGeneration;
        };
        if (!allowed()) return;
        const signed = await account.signer.signEvent(template);
        if (!allowed()) return;
        await publishEvent(signed, getSocialRelayUrls());
      },
    );
    const report = (error: unknown) => {
      if (session !== sessionGeneration || accounts.active !== account) return;
      listeningStatusError.next(
        error instanceof Error ? error.message : String(error),
      );
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = "";
    let lastSent = 0;
    const update = () => {
      clearTimeout(timer);
      const player = usePlayerStore.getState();
      const station = player.currentStation;
      const metadata = useMetadataStore.getState();
      const track =
        metadata._currentStationAddress === station?.address
          ? metadata.currentMetadata
          : null;
      const value: ListeningTrack | null =
        player.isPlaying && station
          ? {
              title: track?.song || track?.title || station.name || "WaveFunc",
              artist: track?.artist,
              address: station.address ?? undefined,
              url: `https://wavefunc.live/station/${nip19.naddrEncode({ kind: station.event.kind, pubkey: station.event.pubkey, identifier: station.event.tags.find((t) => t[0] === "d")?.[1] ?? "" })}`,
            }
          : null;
      const key = JSON.stringify(value);
      if (key === previous && Date.now() - lastSent < 120_000) return;
      if (value && Date.now() - lastSent < 10_000) {
        timer = setTimeout(update, 10_000 - (Date.now() - lastSent));
        return;
      }
      previous = key;
      lastSent = Date.now();
      void publisher
        .update(value)
        .then(() => {
          if (session === sessionGeneration && accounts.active === account)
            listeningStatusError.next(null);
        })
        .catch((error) => {
          previous = "";
          report(error);
        });
    };
    const playerSub = usePlayerStore.subscribe(update);
    const metadataSub = useMetadataStore.subscribe(update);
    const refresh = setInterval(update, 120_000);
    update();
    return () => {
      clearTimeout(timer);
      clearInterval(refresh);
      playerSub();
      metadataSub();
      void publisher.stop().catch(report);
    };
  }, [account, listeningStatus]);
}
