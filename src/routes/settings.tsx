import { SettingsIcon } from "@/components/ui/icons/lucide-settings";
import { createFileRoute } from "@tanstack/react-router";
import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { WalletsSettings } from "@/components/settings/WalletsSettings";
import { MyStationsSettings } from "@/components/settings/MyStationsSettings";
import { MyFavouritesSettings } from "@/components/settings/MyFavouritesSettings";
import { RelaysSettings } from "@/components/settings/RelaysSettings";
import { User, Wallet, Radio, Star, Wifi } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  const currentUser = useNDKCurrentUser();

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <SettingsIcon className="w-16 h-16 text-muted-foreground/30" />
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Please log in to access settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mb-22">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="w-full">
        <div className="w-full overflow-x-auto">
          <TabsList className="w-full justify-start min-w-max">
            <TabsTrigger value="profile" className="gap-2">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="wallets" className="gap-2">
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Wallets</span>
            </TabsTrigger>
            <TabsTrigger value="stations" className="gap-2">
              <Radio className="w-4 h-4" />
              <span className="hidden sm:inline">My Stations</span>
            </TabsTrigger>
            <TabsTrigger value="favourites" className="gap-2">
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">My Favourites</span>
            </TabsTrigger>
            <TabsTrigger value="relays" className="gap-2">
              <Wifi className="w-4 h-4" />
              <span className="hidden sm:inline">Relays</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile" className="mt-6">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="wallets" className="mt-6">
          <WalletsSettings />
        </TabsContent>

        <TabsContent value="stations" className="mt-6">
          <MyStationsSettings />
        </TabsContent>

        <TabsContent value="favourites" className="mt-6">
          <MyFavouritesSettings />
        </TabsContent>

        <TabsContent value="relays" className="mt-6">
          <RelaysSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
