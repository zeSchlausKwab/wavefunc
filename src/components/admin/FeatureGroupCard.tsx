import { useMemo, useState } from "react";
import { FavoritesListPicker } from "./FavoritesListPicker";
import {
  buildAdminFeatureAddRefTemplate,
  buildAdminFeatureDeletionTemplate,
  buildAdminFeatureRemoveRefTemplate,
  getFavoritesListAddress,
  getFavoritesListStationCount,
  type ParsedAdminFeature,
  type ParsedFavoritesList,
} from "../../lib/nostr/domain";
import { useWavefuncNostr } from "../../lib/nostr/runtime";

interface FeatureGroupCardProps {
  feature: ParsedAdminFeature;
  allLists: ParsedFavoritesList[];
  listsEose: boolean;
  onDeleted: () => void;
}

function resolveRefs(refs: string[], allLists: ParsedFavoritesList[]) {
  const byAddress = new Map(
    allLists.map((list) => [getFavoritesListAddress(list), list] as const)
  );

  return refs.map((addr) => ({ address: addr, list: byAddress.get(addr) ?? null }));
}

export function FeatureGroupCard({
  feature,
  allLists,
  listsEose,
  onDeleted,
}: FeatureGroupCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signAndPublish } = useWavefuncNostr();

  const refs = feature.refs;
  const resolved = useMemo(() => resolveRefs(refs, allLists), [allLists, refs]);

  // Centralised error reporting so silent rejections from signAndPublish
  // (signer denied, no write relays, relay rejected the event, network
  // failure, etc.) show up to the user instead of looking like "nothing
  // happened". The error string is rendered above the action buttons and
  // also logged so it's visible in devtools.
  const wrapPublish = async (op: () => Promise<unknown>, opName: string) => {
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[admin] ${opName} failed:`, e);
      setError(`${opName} failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (list: ParsedFavoritesList) =>
    wrapPublish(
      () =>
        signAndPublish(
          buildAdminFeatureAddRefTemplate(feature.event, getFavoritesListAddress(list))
        ),
      "Add list"
    );

  const handleRemove = (address: string) =>
    wrapPublish(
      () =>
        signAndPublish(
          buildAdminFeatureRemoveRefTemplate(feature.event, address)
        ),
      "Remove list"
    );

  const handleDelete = async () => {
    if (!confirm("Delete this feature group?")) return;
    await wrapPublish(async () => {
      await signAndPublish(
        buildAdminFeatureDeletionTemplate(feature.event)
      );
      onDeleted();
    }, "Delete group");
  };

  const shortId = (feature.featureId ?? "--------").slice(0, 8).toUpperCase();

  return (
    <div className="border-4 border-on-background bg-surface-container-low shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b-4 border-on-background bg-surface-container-high">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-widest text-on-background/40 uppercase">
            GROUP
          </span>
          <span className="font-black uppercase tracking-tighter">
            {shortId}
          </span>
          <span className="text-[10px] font-bold tracking-widest text-on-background/40 uppercase">
            · {refs.length} REF{refs.length !== 1 ? "S" : ""}
          </span>
        </div>
        <button
          onClick={handleDelete}
          disabled={busy}
          title="Delete group"
          className="text-on-background/40 hover:text-destructive transition-colors disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-sm">delete</span>
        </button>
      </div>

      {/* Refs */}
      <div className="divide-y-2 divide-on-background/10">
        {resolved.length === 0 && (
          <p className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-on-background/30">
            NO_REFERENCES — ADD A LIST BELOW
          </p>
        )}
        {resolved.map(({ address, list }) => (
          <div
            key={address}
            className="flex items-center justify-between px-4 py-3 gap-4"
          >
            <div className="min-w-0">
              {list ? (
                <>
                  <p className="font-black uppercase tracking-tight truncate">
                    {list.name ?? "UNTITLED"}
                  </p>
                  <p className="text-[10px] font-bold tracking-widest text-on-background/40 mt-0.5">
                    {getFavoritesListStationCount(list)} STATION{getFavoritesListStationCount(list) !== 1 ? "S" : ""}
                    {" · "}
                    {address.split(":")[1]?.slice(0, 8)}…
                  </p>
                </>
              ) : (
                <p className="font-bold uppercase tracking-tight text-on-background/40 truncate text-sm">
                  {address}
                </p>
              )}
            </div>
            <button
              onClick={() => handleRemove(address)}
              disabled={busy}
              title="Remove reference"
              className="shrink-0 text-on-background/40 hover:text-destructive transition-colors disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        ))}
      </div>

      {/* Error banner — surfaces signer rejections, relay errors, etc. */}
      {error && (
        <div className="border-t-4 border-destructive bg-destructive/10 px-4 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-destructive text-sm shrink-0 mt-0.5">
            error
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-destructive">
              PUBLISH_FAILED
            </p>
            <p className="text-xs font-bold text-destructive/80 break-words">
              {error}
            </p>
          </div>
          <button
            onClick={() => setError(null)}
            className="shrink-0 text-destructive/60 hover:text-destructive"
            title="Dismiss"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Add button */}
      <div className="border-t-4 border-on-background/20 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setPickerOpen(true)}
          disabled={busy}
          className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-primary hover:text-primary/70 transition-colors disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-sm">
            {busy ? "sync" : "add"}
          </span>
          {busy ? "PUBLISHING..." : "ADD_LIST"}
        </button>
      </div>

      <FavoritesListPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allLists={allLists}
        eose={listsEose}
        existingRefs={refs}
        onSelect={handleAdd}
      />
    </div>
  );
}
