import { createFileRoute } from "@tanstack/react-router";
import { useProfileValue, NDKUser } from "@nostr-dev-kit/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ExternalLink, Globe, Zap, Copy, Check } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/profile/$pubkey")({
  component: ProfilePage,
});

function ProfilePage() {
  const { pubkey } = Route.useParams();
  const profile = useProfileValue(pubkey);
  const [copied, setCopied] = useState(false);

  const handleCopyPubkey = async () => {
    await navigator.clipboard.writeText(pubkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayName = profile?.displayName || profile?.name || "Anonymous";
  const avatarFallback = displayName.substring(0, 2).toUpperCase();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Banner */}
      <div className="relative w-full h-48 md:h-64 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-lg overflow-hidden">
        {profile?.banner && (
          <img
            src={profile.banner}
            alt="Profile banner"
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Profile Info */}
      <div className="relative px-4 md:px-6 -mt-20">
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-end">
          {/* Avatar */}
          <Avatar className="w-32 h-32 border-4 border-background">
            <AvatarImage src={profile?.picture || profile?.image} />
            <AvatarFallback className="text-3xl">{avatarFallback}</AvatarFallback>
          </Avatar>

          {/* Name and Actions */}
          <div className="flex-1 space-y-2">
            <div>
              <h1 className="text-3xl font-bold">{displayName}</h1>
              {profile?.nip05 && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Check className="w-4 h-4 text-green-500" />
                  {profile.nip05}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Bio & Details */}
        <div className="mt-6 space-y-4">
          {(profile?.bio || profile?.about) && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm whitespace-pre-wrap">
                {profile?.bio || profile?.about}
              </p>
            </div>
          )}

          {/* Additional Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Website */}
            {profile?.website && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline flex items-center gap-1"
                >
                  {profile.website.replace(/^https?:\/\//, "")}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Lightning Address */}
            {(profile?.lud16 || profile?.lud06) && (
              <div className="flex items-center gap-2 text-sm">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span className="text-muted-foreground">
                  {profile?.lud16 || profile?.lud06}
                </span>
              </div>
            )}
          </div>

          {/* Public Key */}
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">Public Key</p>
                <p className="text-sm font-mono break-all">{pubkey}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyPubkey}
                className="flex-shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}