import { Link } from "@tanstack/react-router";
import type { WavefuncAccount } from "../lib/nostr/runtime";
import { useProfile } from "../lib/nostr/auth";

export function MiniProfile({
  userOrPubkey,
}: {
  userOrPubkey?: string | WavefuncAccount | null | undefined;
}) {
  const profile = useProfile(userOrPubkey);
  const pubkey = typeof userOrPubkey === "string" ? userOrPubkey : userOrPubkey?.pubkey;

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
