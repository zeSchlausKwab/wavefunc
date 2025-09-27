import {
  NDKUser,
  useProfileValue,
  type Hexpubkey,
} from "@nostr-dev-kit/ndk-hooks";

export function MiniProfile({
  userOrPubkey,
}: {
  userOrPubkey?: Hexpubkey | NDKUser | null | undefined;
}) {
  const profile = useProfileValue(userOrPubkey);

  return (
    <div className="flex items-center gap-4 border border-muted rounded-md p-2">
      <img
        src={profile?.picture}
        alt={profile?.name}
        className="w-8 h-8 rounded-full"
      />
      <p className="text-sm font-medium text-foreground">{profile?.name}</p>
    </div>
  );
}
