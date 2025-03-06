"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { NDKUser } from "@nostr-dev-kit/ndk";
import { nostrService } from "@/services/ndk";
import { Loader2 } from "lucide-react";

interface ProfileProps {
  pubkey: string;
}

interface NostrProfile {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  lud16?: string;
}

export function Profile({ pubkey }: ProfileProps) {
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const ndk = nostrService.getNDK();
        const user = new NDKUser({ pubkey });
        const userProfile = await user.fetchProfile();
        // console.log("User profile:", userProfile);
        setProfile(userProfile);
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      } finally {
        setLoading(false);
      }
    }

    if (pubkey) {
      fetchProfile();
    }
  }, [pubkey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-10 h-10">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-4">
      <div className="relative w-10 h-10">
        <Image
          src={
            imageError ? "/placeholder.svg" : (
              profile?.picture || "/placeholder.svg"
            )
          }
          alt={profile?.name || "Anonymous"}
          fill
          style={{ objectFit: "cover" }}
          className="rounded-full"
          onError={() => setImageError(true)}
        />
      </div>
      <div className="hidden md:block">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-primary font-press-start-2p">
            {profile?.displayName || profile?.name || "Anonymous"}
          </p>
          {profile?.nip05 && (
            <span className="text-xs text-muted-foreground">
              ✓ {profile.nip05}
            </span>
          )}
          {pubkey}
        </div>
        {profile?.about && (
          <p
            className="text-xs text-muted-foreground font-press-start-2p truncate max-w-[200px]"
            title={profile.about}
          >
            {profile.about}
          </p>
        )}
      </div>
    </div>
  );
}
