import { NDKUser, useProfileValue, type Hexpubkey } from "@nostr-dev-kit/react";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";

export function MiniProfile({
  userOrPubkey,
}: {
  userOrPubkey?: Hexpubkey | NDKUser | null | undefined;
}) {
  const profile = useProfileValue(userOrPubkey);

  const pubkey = userOrPubkey instanceof NDKUser ? userOrPubkey.pubkey : userOrPubkey;

  return (
    <Link to={`/profile/${pubkey}`}>
      <Button className="p-1">
        <Avatar className="w-8 h-8">
          <AvatarImage src={profile?.picture} />
          <AvatarFallback>{profile?.name?.substring(0, 2)}</AvatarFallback>
        </Avatar>
      </Button>
    </Link>
  );
}
