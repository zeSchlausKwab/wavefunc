import { useNDKCurrentUser, useProfileValue } from "@nostr-dev-kit/react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

export function ProfileSettings() {
  const currentUser = useNDKCurrentUser();
  const profile = useProfileValue(currentUser);

  if (!currentUser) {
    return (
      <div className="text-muted-foreground">
        Please log in to edit your profile.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <Avatar className="w-24 h-24">
          <AvatarImage src={profile?.picture} />
          <AvatarFallback className="text-2xl">
            {profile?.name?.substring(0, 2) || "??"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Display Name</Label>
            <Input
              id="name"
              defaultValue={profile?.name || ""}
              placeholder="Your display name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="about">About</Label>
            <Textarea
              id="about"
              defaultValue={profile?.about || ""}
              placeholder="Tell us about yourself"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="picture">Picture URL</Label>
            <Input
              id="picture"
              defaultValue={profile?.picture || ""}
              placeholder="https://example.com/avatar.jpg"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Public Key (npub)</Label>
        <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
          {currentUser.npub}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Hex Public Key</Label>
        <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
          {currentUser.pubkey}
        </div>
      </div>

      <div className="flex gap-2">
        <Button>Save Changes</Button>
        <Button variant="outline">Cancel</Button>
      </div>
    </div>
  );
}
