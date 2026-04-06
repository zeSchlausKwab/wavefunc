import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { WalletsSettings } from "@/components/settings/WalletsSettings";
import { MyStationsSettings } from "@/components/settings/MyStationsSettings";
import { MyFavouritesSettings } from "@/components/settings/MyFavouritesSettings";
import { RelaysSettings } from "@/components/settings/RelaysSettings";
import { useCurrentAccount } from "@/lib/nostr/auth";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

type SettingsTab = "profile" | "wallets" | "stations" | "favourites" | "relays";

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "profile", label: "Profile", icon: "person" },
  { id: "wallets", label: "Wallets", icon: "currency_bitcoin" },
  { id: "stations", label: "Stations", icon: "radio" },
  { id: "favourites", label: "Favourites", icon: "star" },
  { id: "relays", label: "Relays", icon: "wifi" },
];

function Settings() {
  const currentUser = useCurrentAccount();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <span className="material-symbols-outlined text-[64px] text-on-background/20">
          settings
        </span>
        <h1 className="text-2xl font-black uppercase tracking-tighter">
          Settings
        </h1>
        <p className="text-sm text-on-background/60 text-center max-w-md">
          Please log in to access settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mb-22">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-[24px]">settings</span>
        <h1 className="text-2xl font-black uppercase tracking-tighter">
          Settings
        </h1>
      </div>

      {/* Tab bar */}
      <div className="w-full overflow-x-auto">
        <div className="flex border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)]">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors whitespace-nowrap ${
                i < TABS.length - 1 ? "border-r-4 border-on-background" : ""
              } ${
                activeTab === tab.id
                  ? "bg-on-background text-surface"
                  : "bg-surface text-on-background hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {tab.icon}
              </span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "profile" && <ProfileSettings />}
        {activeTab === "wallets" && <WalletsSettings />}
        {activeTab === "stations" && <MyStationsSettings />}
        {activeTab === "favourites" && <MyFavouritesSettings />}
        {activeTab === "relays" && <RelaysSettings />}
      </div>
    </div>
  );
}
