import { useEffect, useState } from 'react'
import { auth } from '@/lib/store/auth'
import { nostrService } from '@/lib/services/ndk'
import { Loader2, UserCircle2, Shield, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useStore } from '@tanstack/react-store'

interface ProfileProps {
    compact?: boolean
}

interface ProfileData {
    name?: string
    about?: string
    picture?: string
}

// Cache profiles for 5 minutes
const PROFILE_CACHE_TIME = 5 * 60 * 1000
const profileCache = new Map<string, { data: ProfileData; timestamp: number }>()

export function Profile({ compact = false }: ProfileProps) {
    const authState = useStore(auth.store)
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!authState.user?.pubkey) {
            setIsLoading(false)
            return
        }

        const fetchProfile = async () => {
            const pubkey = authState.user?.pubkey
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

                const ndk = nostrService.getNDK()
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
    const isAnonymous = authState.status === 'anonymous'

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
                                className={cn('relative', isAnonymous && 'text-muted-foreground hover:text-foreground')}
                            >
                                {isAnonymous ? (
                                    <Shield className={cn('h-4 w-4', !compact && 'mr-2')} />
                                ) : (
                                    <UserCircle2 className={cn('h-4 w-4', !compact && 'mr-2')} />
                                )}
                                {!compact && displayName}
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                        {isAnonymous ? "You're browsing anonymously" : 'View profile options'}
                    </TooltipContent>
                </Tooltip>
                <DropdownMenuContent className="w-56" align="end">
                    <DropdownMenuLabel>
                        {displayName}
                        <span className="block text-xs text-muted-foreground truncate">{authState.user?.pubkey}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => auth.logout()}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Log out
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </TooltipProvider>
    )
}
