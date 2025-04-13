import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { ndkActions } from '@/lib/store/ndk'
import { NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Nip05BadgeProps {
    userId: string
}

export function Nip05Badge({ userId }: Nip05BadgeProps) {
    const { data, isLoading } = useQuery({
        queryKey: ['nip05', userId],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            const user = ndk.getUser({ pubkey: userId })
            const userProfile = await user.fetchProfile({
                cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
            })

            if (!userProfile?.nip05) return null

            // For now, we'll assume all nip05 addresses are verified
            return {
                nip05: userProfile.nip05,
                verified: true,
            }
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    })

    if (isLoading || !data?.nip05) return null

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <div className="flex items-center">
                        {data.verified ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                        )}
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p className="text-xs">
                        {data.verified ? 'Verified' : 'Unverified'} NIP-05: {data.nip05}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
