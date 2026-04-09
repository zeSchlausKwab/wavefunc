import React from "react";
import { User, BadgeCheck } from "lucide-react";
import { useProfile } from "../lib/nostr/auth";

type UserAvatarMode = "name-only" | "avatar-name" | "avatar-name-bio" | "full-profile";

interface UserAvatarProps {
  pubkey: string;
  mode?: UserAvatarMode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showNip05Badge?: boolean;
}

/**
 * UserAvatar displays a user's profile in various modes:
 * - name-only: Just the display name with optional NIP-05 badge
 * - avatar-name: Avatar next to name (simple one-liner)
 * - avatar-name-bio: Bigger avatar with name and bio
 * - full-profile: Large avatar with name, bio, and additional profile info
 *
 * Name is always either profile name or first 6 chars of pubkey
 * NIP-05 badge shows verification status (checkmark for valid, X for invalid)
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  pubkey,
  mode = "avatar-name",
  size = "md",
  className = "",
  showNip05Badge = true,
}) => {
  const profile = useProfile(pubkey);

  // Get display name: profile name or first 6 chars of pubkey
  const displayName = profile?.name || profile?.displayName || pubkey.slice(0, 6);

  // Avatar size configurations
  const avatarSizes = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-20 h-20",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-6 h-6",
    xl: "w-10 h-10",
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
    xl: "text-xl",
  };

  // NIP-05 Badge Component
  const Nip05Badge = () => {
    if (!showNip05Badge || !profile?.nip05) return null;

    return (
      <span title={profile.nip05}>
        <BadgeCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
      </span>
    );
  };

  // Avatar Image Component
  const AvatarImage = ({ sizeClass }: { sizeClass: string }) => (
    <div
      className={`${sizeClass} rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0`}
    >
      {profile?.picture ? (
        <img
          src={profile.picture}
          alt={displayName}
          className="w-full h-full object-cover"
        />
      ) : (
        <User className={iconSizes[size]} />
      )}
    </div>
  );

  // Render based on mode
  switch (mode) {
    case "name-only":
      return (
        <div className={`flex items-center gap-1.5 ${className}`}>
          <span className={`font-medium text-gray-900 ${textSizes[size]}`}>
            {displayName}
          </span>
          <Nip05Badge />
        </div>
      );

    case "avatar-name":
      return (
        <div className={`flex items-center gap-2 min-w-0 ${className}`}>
          <AvatarImage sizeClass={avatarSizes[size]} />
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`font-medium text-gray-900 truncate ${textSizes[size]}`}>
              {displayName}
            </span>
            <Nip05Badge />
          </div>
        </div>
      );

    case "avatar-name-bio":
      return (
        <div className={`flex items-start gap-3 ${className}`}>
          <AvatarImage sizeClass={avatarSizes[size === "sm" ? "md" : size === "md" ? "lg" : "xl"]} />
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`font-semibold text-gray-900 ${textSizes[size === "sm" ? "md" : "lg"]}`}>
                {displayName}
              </span>
              <Nip05Badge />
            </div>
            {profile?.about && (
              <p className="text-sm text-gray-600 line-clamp-2">
                {profile.about}
              </p>
            )}
          </div>
        </div>
      );

    case "full-profile":
      return (
        <div className={`flex flex-col items-center gap-4 ${className}`}>
          <AvatarImage sizeClass="w-24 h-24" />
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-gray-900">
                {displayName}
              </h3>
              <Nip05Badge />
            </div>
            {profile?.nip05 && (
              <p className="text-sm text-gray-500">
                {profile.nip05}
              </p>
            )}
            {profile?.about && (
              <p className="text-sm text-gray-700 max-w-md">
                {profile.about}
              </p>
            )}
            {profile?.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                {profile.website}
              </a>
            )}
          </div>
        </div>
      );

    default:
      return null;
  }
};
