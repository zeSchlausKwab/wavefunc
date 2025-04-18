import { useEffect, useState } from 'react'
import { Loader2, UserCircle2, Shield, LogOut, Globe, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@wavefunc/common'
import { useStore } from '@tanstack/react-store'
import { ndkActions, useNDK } from '@wavefunc/common'
import { authActions, authStore } from '@wavefunc/common'
import { type NDKUserProfile } from '@nostr-dev-kit/ndk'

interface ProfileProps {
    compact?: boolean
}

interface ProfileData {
    name?: string
    about?: string
    picture?: string
    website?: string
    lud16?: string
}

// Cache profiles for 5 minutes
const PROFILE_CACHE_TIME = 5 * 60 * 1000
const profileCache = new Map<string, { data: ProfileData; timestamp: number }>()

export function Profile({ compact = false }: ProfileProps) {
    const authState = useStore(authStore)
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const { ndk } = useNDK()

    useEffect(() => {
        if (!ndk?.activeUser?.pubkey) {
            setIsLoading(false)
            return
        }

        const fetchProfile = async () => {
            const pubkey = ndk?.activeUser?.pubkey
            if (!pubkey) {
                setIsLoading(false)
                return
            }

            try {
                // Check cache first
                const cached = profileCache.get(pubkey)
                if (cached && Date.now() - cached.timestamp < PROFILE_CACHE_TIME) {
                    setProfile(cached.data)
                    setIsLoading(false)
                    return
                }

                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not initialized')
                }

                // Create a timeout promise
                const timeoutPromise = new Promise<ProfileData>((_, reject) => {
                    setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
                })

                const user = ndk.getUser({ pubkey })
                const profilePromise = user.fetchProfile() as Promise<ProfileData>

                // Race between fetch and timeout
                const profile = await Promise.race([profilePromise, timeoutPromise])

                // Cache the result
                profileCache.set(pubkey, {
                    data: profile,
                    timestamp: Date.now(),
                })

                setProfile(profile)
            } catch (error) {
                console.error('Error fetching profile:', error)
                // If fetch fails, try to use cached data even if expired
                const cached = profileCache.get(pubkey)
                if (cached) {
                    setProfile(cached.data)
                }
            } finally {
                setIsLoading(false)
            }
        }

        fetchProfile()
    }, [authState.user?.pubkey])

    const displayName = profile?.name || 'Local User'
    const isAnonymous = authState.isAuthenticated === false

    // Show a quick loading state for the first 500ms
    if (isLoading && Date.now() - performance.now() < 500) {
        return null
    }

    // Show the spinner loading state after 500ms
    if (isLoading) {
        return (
            <Button variant="ghost" size={compact ? 'icon' : 'default'} disabled>
                <Loader2 className={cn('h-4 w-4 animate-spin', !compact && 'mr-2')} />
                {!compact && 'Loading...'}
            </Button>
        )
    }

    return (
        <TooltipProvider>
            <DropdownMenu>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant={isAnonymous ? 'ghost' : 'outline'}
                                size={compact ? 'icon' : 'default'}
                                className={cn(
                                    'relative flex items-center gap-2',
                                    isAnonymous && 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {isAnonymous ? (
                                    <Shield className="h-4 w-4" />
                                ) : (
                                    <Avatar className="h-6 w-6">
                                        <AvatarImage src={profile?.picture} alt={displayName} />
                                        <AvatarFallback>{displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                )}
                                {!compact && displayName}
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                        {isAnonymous ? "You're browsing anonymously" : 'View profile options'}
                    </TooltipContent>
                </Tooltip>
                <DropdownMenuContent className="w-72" align="end">
                    <DropdownMenuLabel className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={profile?.picture} alt={displayName} />
                            <AvatarFallback>{displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="font-medium">{displayName}</span>
                            {profile?.about && (
                                <span className="text-xs text-muted-foreground line-clamp-2">{profile.about}</span>
                            )}
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {profile?.website && (
                        <DropdownMenuItem className="flex items-center gap-2 cursor-default">
                            <Globe className="h-4 w-4" />
                            <a
                                href={profile.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm truncate hover:underline"
                            >
                                {profile.website}
                            </a>
                        </DropdownMenuItem>
                    )}
                    {profile?.lud16 && (
                        <DropdownMenuItem className="flex items-center gap-2 cursor-default">
                            <Zap className="h-4 w-4" />
                            <span className="text-sm truncate">{profile.lud16}</span>
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => authActions.logout()}
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        Log out
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </TooltipProvider>
    )
}
