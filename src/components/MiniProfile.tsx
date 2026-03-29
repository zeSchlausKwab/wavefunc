import { NDKUser, useProfileValue, type Hexpubkey } from "@nostr-dev-kit/react";
import { Link } from "@tanstack/react-router";

export function MiniProfile({
  userOrPubkey,
}: {
  userOrPubkey?: Hexpubkey | NDKUser | null | undefined;
}) {
  const profile = useProfileValue(userOrPubkey);
  const pubkey =
    userOrPubkey instanceof NDKUser ? userOrPubkey.pubkey : userOrPubkey;

  return (
    <Link to={`/profile/${pubkey}`}>
      <div className="w-9 h-full border-r-4 border-on-background overflow-hidden bg-on-background flex items-center justify-center hover:opacity-80 transition-opacity group shrink-0">
        {profile?.picture ? (
          <img
            src={profile.picture}
            alt={profile?.name || "Profile"}
            className="w-full h-full object-cover grayscale contrast-125 group-hover:grayscale-0 transition-all"
          />
        ) : (
          <span className="material-symbols-outlined text-[18px] text-surface/50">
            person
          </span>
        )}
      </div>
    </Link>
  );
}
