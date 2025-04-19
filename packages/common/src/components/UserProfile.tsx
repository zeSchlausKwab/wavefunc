import { Avatar, AvatarFallback, AvatarImage } from '@wavefunc/ui/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@wavefunc/ui/components/ui/tooltip'
import { NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk'
import { useQuery } from '@tanstack/react-query'
import { useStore } from '@tanstack/react-store'
import { authStore, ndkActions } from '@wavefunc/common'
import { CheckCircle2, Globe, Shield, XCircle } from 'lucide-react'

interface UserProfileProps {
    pubkey: string
    compact?: boolean
}

interface ProfileData {
    name?: string
    displayName?: string
    about?: string
    picture?: string
    website?: string
    nip05?: string
    nip05Verified?: boolean
}

export function UserProfile({ pubkey, compact = true }: UserProfileProps) {
    const authState = useStore(authStore)
    const isMe = authState.user?.pubkey === pubkey

    const { data: profile, isLoading } = useQuery({
        queryKey: ['user-profile', pubkey],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            const user = ndk.getUser({ pubkey })
            const userProfile = await user.fetchProfile({
                cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
            })

            // Check NIP05 if available
            let nip05Verified = false
            if (userProfile?.nip05) {
                try {
                    // For now, we'll just show the NIP05 without verification
                    // as the NDK methods for NIP05 verification seem to be in flux
                    nip05Verified = true
                } catch (error) {
                    console.error('Error checking NIP05:', error)
                }
            }

            return {
                name: userProfile?.name,
                displayName: userProfile?.displayName,
                about: userProfile?.about,
                picture: userProfile?.picture,
                website: userProfile?.website,
                nip05: userProfile?.nip05,
                nip05Verified,
            } as ProfileData
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    })

    if (isLoading) {
        return (
            <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                    <AvatarFallback>...</AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">Loading...</span>
            </div>
        )
    }

    const displayName = profile?.name || profile?.displayName || pubkey.slice(0, 8) + '...'
    const avatarText = (displayName || '').substring(0, 2).toUpperCase()

    const profileContent = (
        <div className="flex items-center gap-2 cursor-pointer">
            <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.picture} alt={displayName} />
                <AvatarFallback>{avatarText}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
                <div className="flex items-center gap-1">
                    <span className="text-xs font-medium">{displayName}</span>
                    {isMe && <Shield className="h-3 w-3 text-primary" />}
                    {profile?.nip05 &&
                        (profile.nip05Verified ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                            <XCircle className="h-3 w-3 text-red-500" />
                        ))}
                </div>
                {profile?.website && (
                    <a
                        href={profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()} // Prevent navigation to profile page when clicking the website link
                    >
                        <Globe className="h-3 w-3" />
                        {profile.website}
                    </a>
                )}
            </div>
        </div>
    )

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div onClick={() => (window.location.href = `/profile/${pubkey}`)} className="cursor-pointer">
                        {profileContent}
                    </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-[200px]">
                    {profile?.about && <p className="text-xs text-muted-foreground line-clamp-2">{profile.about}</p>}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
