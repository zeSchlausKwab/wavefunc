import { useState } from "react";
import { useAdminFeatures } from "../../lib/hooks/useAdminFeatures";
import { FeatureGroupCard } from "./FeatureGroupCard";
import {
  buildAdminFeatureTemplate,
  type AdminFeatureType,
} from "../../lib/nostr/domain";
import { useCurrentAccount } from "../../lib/nostr/auth";
import { useWavefuncNostr } from "../../lib/nostr/runtime";

const TABS: { type: AdminFeatureType; label: string; future?: boolean }[] = [
  { type: "lists", label: "FEATURED_LISTS" },
  { type: "stations", label: "FEATURED_STATIONS", future: true },
  { type: "users", label: "FEATURED_USERS", future: true },
];

function FeatureTab({ type }: { type: AdminFeatureType }) {
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const { features, isLoading } = useAdminFeatures(type);
  const [creating, setCreating] = useState(false);
  // Track locally deleted IDs until relay confirms removal
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const visible = features.filter((f) => !deletedIds.has(f.id ?? ""));

  const handleCreate = async () => {
    if (!currentUser) return;
    setCreating(true);
    try {
      await signAndPublish(buildAdminFeatureTemplate({ type }));
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-12 text-on-background/40">
        <span className="material-symbols-outlined animate-spin">sync</span>
        <span className="font-bold uppercase tracking-tight text-sm">LOADING...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {visible.length === 0 && (
        <div className="border-4 border-on-background/20 border-dashed px-8 py-12 text-center">
          <p className="font-black uppercase tracking-tight text-on-background/30 text-lg">
            NO_FEATURE_GROUPS
          </p>
          <p className="text-xs font-bold uppercase tracking-widest text-on-background/20 mt-2">
            CREATE A GROUP BELOW TO START CURATING
          </p>
        </div>
      )}

      {visible.map((feature) => (
        <FeatureGroupCard
          key={feature.featureId ?? feature.id}
          feature={feature}
          onDeleted={() => {
            if (feature.id) {
              setDeletedIds((prev) => new Set(prev).add(feature.id));
            }
          }}
        />
      ))}

      <button
        onClick={handleCreate}
        disabled={creating}
        className="flex items-center gap-2 border-4 border-on-background px-4 py-3 font-black uppercase tracking-tight hover:bg-on-background hover:text-surface transition-colors shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-sm">
          {creating ? "sync" : "add"}
        </span>
        {creating ? "PUBLISHING..." : "NEW_FEATURE_GROUP"}
      </button>
    </div>
  );
}

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminFeatureType>("lists");

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="border-4 border-on-background bg-on-background text-surface px-6 py-4 shadow-[8px_8px_0px_0px_rgba(29,28,19,0.3)]">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined">admin_panel_settings</span>
          <h1 className="font-black uppercase tracking-tighter text-2xl">
            ADMIN_CONTROL_PANEL
          </h1>
        </div>
        <p className="text-xs font-bold tracking-widest text-surface/50 mt-1 uppercase">
          MANAGE CURATED CONTENT · OPERATOR ACCESS ONLY
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b-4 border-on-background gap-0">
        {TABS.map(({ type, label, future }) => (
          <button
            key={type}
            onClick={() => !future && setActiveTab(type)}
            disabled={future}
            className={`px-4 py-2 font-black uppercase tracking-tight text-sm border-r-2 border-on-background/20 transition-colors
              ${activeTab === type
                ? "bg-on-background text-surface"
                : "hover:bg-surface-container-high text-on-background"
              }
              ${future ? "opacity-30 cursor-not-allowed" : ""}
            `}
          >
            {label}
            {future && (
              <span className="ml-2 text-[9px] tracking-widest">SOON</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <FeatureTab type={activeTab} />
    </div>
  );
}
