import { NDKUser, useProfileValue, type Hexpubkey } from "@nostr-dev-kit/react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

export function MiniProfile({
  userOrPubkey,
}: {
  userOrPubkey?: Hexpubkey | NDKUser | null | undefined;
}) {
  const profile = useProfileValue(userOrPubkey);

  return (
    <Avatar>
      <AvatarImage src={profile?.picture} />
      <AvatarFallback>{profile?.name?.substring(0, 2)}</AvatarFallback>
    </Avatar>
  );
}
