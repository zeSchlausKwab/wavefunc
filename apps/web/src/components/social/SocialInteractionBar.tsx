import { Button } from '@/components/ui/button'
import { ndkActions } from '@/lib/store/ndk'
import { cn } from '@/lib/utils'
import { NDKEvent, NDKSubscription, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchReactions, publishReaction } from '@wavefunc/common'
import { Heart, MessageCircle, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ShareStationButton } from '../ShareStationButton'
import { ZapDialog } from '../zap/ZapDialog'

interface SocialInteractionBarProps {
    event: NDKEvent
    naddr: string
    authorPubkey: string
    commentsCount?: number
    onCommentClick?: () => void
    className?: string
    compact?: boolean
}

export function SocialInteractionBar({
    event,
    naddr,
    commentsCount = 0,
    onCommentClick,
    className = '',
    compact = false,
}: SocialInteractionBarProps) {
    const queryClient = useQueryClient()
    const [userPubkey, setUserPubkey] = useState<string | undefined>()
    const [hasUserReacted, setHasUserReacted] = useState(false)
    const [hasUserZapped, setHasUserZapped] = useState(false)
    const [isZapDialogOpen, setIsZapDialogOpen] = useState(false)
    const [canAuthorReceiveZaps, setCanAuthorReceiveZaps] = useState<boolean | null>(null)
    const [checkingZapCapability, setCheckingZapCapability] = useState(false)
    const [recentlyZapped, setRecentlyZapped] = useState(false)
    const [localZaps, setLocalZaps] = useState<NDKEvent[]>([])

    // Use a ref to track subscription and avoid cleanup issues
    const zapSubscriptionRef = useRef<NDKSubscription | null>(null)

    // Fetch reactions (likes only)
    const { data: reactions = [] } = useQuery({
        queryKey: ['reactions', event.id],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')
            return fetchReactions(ndk as any, event.id)
        },
        enabled: !!event.id,
    })

    // Fetch zap events (kind 9735)
    const { data: zaps = [], isLoading: isLoadingZaps } = useQuery({
        queryKey: ['zaps', event.id],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            // Query for zap receipts (kind 9735) that reference this event
            const filter = {
                kinds: [9735],
                '#e': [event.id],
            }

            try {
                const events = await ndk.fetchEvents(filter, {
                    cacheUsage: NDKSubscriptionCacheUsage.PARALLEL,
                })
                return Array.from(events)
            } catch (error) {
                console.error('Failed to fetch zaps:', error)
                return []
            }
        },
        enabled: !!event.id,
    })

    // Set up live subscription for new zaps
    useEffect(() => {
        if (!event?.id) return

        const ndk = ndkActions.getNDK()
        if (!ndk) return

        // Clean up any existing subscription
        if (zapSubscriptionRef.current) {
            zapSubscriptionRef.current.stop()
            zapSubscriptionRef.current = null
        }

        // Set up a subscription for new zap receipts
        const filter = {
            kinds: [9735],
            '#e': [event.id],
            since: Math.floor(Date.now() / 1000) - 10, // Allow some buffer for new events
        }

        const sub = ndk.subscribe(filter, {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        })

        sub.on('event', (zapEvent: NDKEvent) => {
            console.log('New zap receipt received:', zapEvent)

            // Add to local state for immediate UI update
            setLocalZaps((current) => {
                // Avoid duplicates
                if (current.some((e) => e.id === zapEvent.id)) return current
                return [...current, zapEvent]
            })

            // Invalidate query to refetch complete set
            queryClient.invalidateQueries({ queryKey: ['zaps', event.id] })
        })

        zapSubscriptionRef.current = sub

        return () => {
            if (zapSubscriptionRef.current) {
                zapSubscriptionRef.current.stop()
                zapSubscriptionRef.current = null
            }
        }
    }, [event?.id, queryClient])

    // Combine fetched zaps with local real-time zaps
    const allZaps = [
        ...zaps,
        ...localZaps.filter((localZap) => !zaps.some((fetchedZap) => fetchedZap.id === localZap.id)),
    ]

    // Calculate total zap amount from all zaps
    const totalZapAmount = allZaps.reduce((total, zapEvent) => {
        // Look for amount tag
        const amountTag = zapEvent.tags.find((tag) => tag[0] === 'amount')
        if (amountTag && amountTag[1]) {
            // Convert to sats from millisats
            return total + (parseInt(amountTag[1], 10) / 1000 || 0)
        }
        return total
    }, 0)

    // Check if the author can receive zaps
    useEffect(() => {
        const checkZapCapability = async () => {
            if (!event?.pubkey) return

            try {
                setCheckingZapCapability(true)
                const ndk = ndkActions.getNDK()
                if (!ndk) throw new Error('NDK not available')

                const userToZap = ndk.getUser({ pubkey: event.pubkey })
                const zapInfo = await userToZap.getZapInfo()
                console.log('zapInfo', zapInfo)
                setCanAuthorReceiveZaps(zapInfo.size > 0)
            } catch (error) {
                console.error('Failed to check zap capability:', error)
                setCanAuthorReceiveZaps(false)
            } finally {
                setCheckingZapCapability(false)
            }
        }

        checkZapCapability()
    }, [event?.pubkey])

    // Process zap events to determine if the current user has zapped
    useEffect(() => {
        if (!allZaps || allZaps.length === 0) {
            setHasUserZapped(false)
            return
        }

        if (userPubkey) {
            // Check if any zap has the current user in a P tag
            const userHasZapped = allZaps.some((zapEvent) =>
                zapEvent.tags.some((tag) => (tag[0] === 'P' || tag[0] === 'p') && tag[1] === userPubkey),
            )
            setHasUserZapped(userHasZapped)
        }
    }, [allZaps, userPubkey])

    // Get current user and check for likes
    useEffect(() => {
        const getUserPubkey = async () => {
            const ndk = ndkActions.getNDK()
            const user = await ndk?.signer?.user()
            setUserPubkey(user?.pubkey)
        }
        getUserPubkey()

        // Check if user has liked the content
        const hasUserReacted = reactions.some((event) => event.pubkey === userPubkey && event.content === '❤️')
        setHasUserReacted(hasUserReacted)
    }, [reactions, userPubkey])

    const likeCount = reactions.filter((event) => event.content === '❤️').length

    const reactionMutation = useMutation({
        mutationFn: async (content: string) => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')
            await publishReaction(ndk as any, event as any, content)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reactions', event.id] })
        },
        onError: (error) => {
            toast.error('Failed to react: ' + (error instanceof Error ? error.message : 'Unknown error'))
        },
    })

    const handleZap = () => {
        if (canAuthorReceiveZaps) {
            setIsZapDialogOpen(true)
        } else {
            toast.error('This user cannot receive zaps')
        }
    }

    const handleLike = () => {
        reactionMutation.mutate('❤️')
    }

    const handleZapComplete = (zapEvent?: NDKEvent) => {
        console.log('Zap complete with event:', zapEvent)
        setIsZapDialogOpen(false)

        // Show temporary visual feedback
        setRecentlyZapped(true)
        setTimeout(() => setRecentlyZapped(false), 3000)

        // If we received a zap event, add it to local state for immediate feedback
        if (zapEvent) {
            setLocalZaps((current) => {
                // Avoid duplicates
                if (current.some((e) => e.id === zapEvent.id)) return current
                return [...current, zapEvent]
            })
        }

        // Invalidate zaps query to refresh the list
        queryClient.invalidateQueries({ queryKey: ['zaps', event.id] })
    }

    const zapButtonClassName = cn(
        compact ? 'h-3 w-3 mr-1' : 'h-4 w-4',
        recentlyZapped
            ? 'fill-yellow-400 text-yellow-400 animate-pulse'
            : hasUserZapped
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-primary',
    )

    return (
        <>
            <div className={cn('flex space-x-1', className)}>
                <Button
                    variant="ghost"
                    size={compact ? 'sm' : 'icon'}
                    aria-label="Zap"
                    onClick={handleZap}
                    disabled={reactionMutation.isPending || checkingZapCapability || canAuthorReceiveZaps === false}
                    title={
                        canAuthorReceiveZaps === false
                            ? 'User cannot receive zaps'
                            : `Send a zap to this user${totalZapAmount > 0 ? ` (${Math.round(totalZapAmount)} sats so far)` : ''}`
                    }
                    className={cn(compact ? 'h-7 px-1' : 'h-8 w-8')}
                >
                    <Zap className={zapButtonClassName} />
                    {compact && (
                        <span className={cn('text-xs', (hasUserZapped || recentlyZapped) && 'text-yellow-400')}>
                            {isLoadingZaps ? '...' : allZaps.length > 0 ? allZaps.length : ''}
                        </span>
                    )}
                </Button>

                <Button
                    variant="ghost"
                    size={compact ? 'sm' : 'icon'}
                    aria-label="Like"
                    onClick={hasUserReacted ? undefined : handleLike}
                    className={cn(compact ? 'h-7 px-1' : 'h-8 w-8')}
                >
                    <Heart
                        className={cn(
                            compact ? 'h-3 w-3 mr-1' : 'h-4 w-4',
                            hasUserReacted ? 'fill-red-500 text-red-500' : 'text-primary',
                        )}
                    />
                    {compact && (
                        <span className={cn('text-xs', hasUserReacted && 'text-red-500')}>
                            {likeCount > 0 ? likeCount : ''}
                        </span>
                    )}
                </Button>

                <Button
                    variant="ghost"
                    size={compact ? 'sm' : 'icon'}
                    aria-label="Comment"
                    onClick={onCommentClick}
                    className={cn(compact ? 'h-7 px-1' : 'h-8 w-8')}
                >
                    <MessageCircle className={cn('text-primary', compact ? 'h-3 w-3 mr-1' : 'h-4 w-4')} />
                    {compact && <span className="text-xs">{commentsCount > 0 ? commentsCount : ''}</span>}
                </Button>

                <ShareStationButton
                    stationId={event.id}
                    stationName={event.content}
                    className={cn(compact ? 'h-7 w-7' : 'h-8 w-8')}
                    naddr={naddr}
                />
            </div>

            {/* Zap Dialog */}
            <ZapDialog
                isOpen={isZapDialogOpen}
                onOpenChange={setIsZapDialogOpen}
                event={event}
                onZapComplete={handleZapComplete}
            />
        </>
    )
}
