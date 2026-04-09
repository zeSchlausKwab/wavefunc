import { useMemo, useState } from "react";
import { FavoritesListPicker } from "./FavoritesListPicker";
import { useFavoritesLists } from "../../lib/hooks/useFavorites";
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
  onDeleted: () => void;
}

function useResolvedRefs(refs: string[]) {
  const { events } = useFavoritesLists();

  return useMemo(() => {
    const byAddress = new Map(
      events.map((list) => [getFavoritesListAddress(list), list] as const)
    );

    return refs.map((addr) => ({ address: addr, list: byAddress.get(addr) ?? null }));
  }, [events, refs]);
}

export function FeatureGroupCard({ feature, onDeleted }: FeatureGroupCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { signAndPublish } = useWavefuncNostr();

  const refs = feature.refs;
  const resolved = useResolvedRefs(refs);

  const handleAdd = async (list: ParsedFavoritesList) => {
    setBusy(true);
    try {
      await signAndPublish(
        buildAdminFeatureAddRefTemplate(feature.event, getFavoritesListAddress(list)),
        feature.relays
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (address: string) => {
    setBusy(true);
    try {
      await signAndPublish(
        buildAdminFeatureRemoveRefTemplate(feature.event, address),
        feature.relays
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this feature group?")) return;
    setBusy(true);
    try {
      await signAndPublish(
        buildAdminFeatureDeletionTemplate(feature.event),
        feature.relays
      );
      onDeleted();
    } finally {
      setBusy(false);
    }
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

      {/* Add button */}
      <div className="border-t-4 border-on-background/20 px-4 py-3">
        <button
          onClick={() => setPickerOpen(true)}
          disabled={busy}
          className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-primary hover:text-primary/70 transition-colors disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          ADD_LIST
        </button>
      </div>

      <FavoritesListPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        existingRefs={refs}
        onSelect={handleAdd}
      />
    </div>
  );
}
