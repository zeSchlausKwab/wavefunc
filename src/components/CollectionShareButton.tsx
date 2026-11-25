import type { ParsedFavoritesList } from "../lib/nostr/domain/favorites-list";
import { publicCollectionPath } from "../lib/publicPageMetadata";
import { shareOrCopy } from "../lib/share";
import { isTauri } from "../config/env";
import { showToast } from "../stores/toastStore";

export function CollectionShareButton({ list }: { list: ParsedFavoritesList }) {
  const share = async () => {
    const url = new URL(publicCollectionPath(list.event), isTauri() ? "https://wavefunc.live" : window.location.origin);
    const result = await shareOrCopy({
      url: url.href,
      title: list.name || "WaveFunc collection",
      text: `Listen to ${list.name || "this collection"} on WaveFunc`,
    });
    if (result === "copied") showToast({ message: "Collection link copied.", tone: "success" });
    if (result === "failed") showToast({ message: "Open the collection and copy its address to share it.", tone: "error" });
  };

  return <button type="button" onClick={share} aria-label="Share collection" title="Share collection"
    className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-primary focus-visible:outline-offset-2">
    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">share</span>
  </button>;
}
