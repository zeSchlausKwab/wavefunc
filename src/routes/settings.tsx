import { SettingsIcon } from "@/components/ui/icons/lucide-settings";
import { createFileRoute } from "@tanstack/react-router";
import { useNDKCurrentUser } from "@nostr-dev-kit/react";

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
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
      </div>

      {/* Settings content */}
      <div className="space-y-6 max-w-2xl">
        <div className="rounded-lg border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Account</h2>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Public Key: {currentUser.pubkey}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Application</h2>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              More settings coming soon...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
