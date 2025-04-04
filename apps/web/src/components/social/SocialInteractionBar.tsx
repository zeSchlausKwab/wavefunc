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

        if (zapSubscriptionRef.current) {
            zapSubscriptionRef.current.stop()
            zapSubscriptionRef.current = null
        }

        const filter = {
            kinds: [9735],
            '#e': [event.id],
            since: Math.floor(Date.now() / 1000) - 10,
        }

        const sub = ndk.subscribe(filter, {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        })

        sub.on('event', (zapEvent: NDKEvent) => {
            setLocalZaps((current) => {
                // Avoid duplicates
                if (current.some((e) => e.id === zapEvent.id)) return current
                return [...current, zapEvent]
            })

            queryClient.invalidateQueries({ queryKey: ['zaps', event.id] })

            if (userPubkey) {
                const isFromUser = zapEvent.tags.some(
                    (tag) => (tag[0] === 'P' || tag[0] === 'p') && tag[1] === userPubkey,
                )

                let isFromUserDescription = false
                const descriptionTag = zapEvent.tags.find((t) => t[0] === 'description')?.[1]
                if (descriptionTag) {
                    try {
                        const zapRequest = JSON.parse(descriptionTag)
                        isFromUserDescription = zapRequest.pubkey === userPubkey
                    } catch (error) {
                        // Ignore parsing errors
                    }
                }

                if (isFromUser || isFromUserDescription) {
                    setHasUserZapped(true)
                    setRecentlyZapped(true)
                    setTimeout(() => setRecentlyZapped(false), 3000)
                }
            }
        })

        zapSubscriptionRef.current = sub

        return () => {
            if (zapSubscriptionRef.current) {
                zapSubscriptionRef.current.stop()
                zapSubscriptionRef.current = null
            }
        }
    }, [event?.id, queryClient, userPubkey])

    const allZaps = [
        ...zaps,
        ...localZaps.filter((localZap) => !zaps.some((fetchedZap) => fetchedZap.id === localZap.id)),
    ]

    const totalZapAmount = allZaps.reduce((total, zapEvent) => {
        let foundAmount = false
        let eventAmount = 0

        const amountTag = zapEvent.tags.find((tag) => tag[0] === 'amount')
        if (amountTag && amountTag[1]) {
            try {
                eventAmount = parseInt(amountTag[1], 10) / 1000 || 0
                foundAmount = true
            } catch (e) {
                console.error(`Error parsing amount tag: ${amountTag[1]}`, e)
            }
        }

        if (!foundAmount) {
            const bolt11Tag = zapEvent.tags.find((tag) => tag[0] === 'bolt11')
            if (bolt11Tag && bolt11Tag[1]) {
                const match = bolt11Tag[1].match(/^lnbc(\d+)([munp])?/)
                if (match) {
                    let amount = parseInt(match[1], 10)

                    const unit = match[2]
                    if (unit === 'm')
                        amount *= 0.001 // milli
                    else if (unit === 'u')
                        amount *= 0.000001 // micro
                    else if (unit === 'n')
                        amount *= 0.000000001 // nano
                    else if (unit === 'p') amount *= 0.000000000001 // pico

                    eventAmount = amount * 100000000
                    foundAmount = true
                }
            }
        }

        if (!foundAmount) {
            const descriptionTag = zapEvent.tags.find((tag) => tag[0] === 'description')?.[1]
            if (descriptionTag) {
                try {
                    const zapRequest = JSON.parse(descriptionTag)

                    const requestAmountTag = zapRequest.tags?.find((tag: string[]) => tag[0] === 'amount')?.[1]
                    if (requestAmountTag) {
                        eventAmount = parseInt(requestAmountTag, 10) / 1000 || 0
                        foundAmount = true
                    }

                    if (!foundAmount) {
                        const bolt11 = zapEvent.tags.find((tag) => tag[0] === 'bolt11')?.[1]
                        if (bolt11) {
                            const match = bolt11.match(/lnbc(\d+)([munp])?1/)
                            if (match) {
                                let amount = parseInt(match[1], 10)

                                // Handle units
                                const unit = match[2]
                                if (unit === 'm')
                                    amount *= 0.001 // milli
                                else if (unit === 'u')
                                    amount *= 0.000001 // micro
                                else if (unit === 'n')
                                    amount *= 0.000000001 // nano
                                else if (unit === 'p') amount *= 0.000000000001 // pico

                                eventAmount = amount * 100000000
                                foundAmount = true
                            }
                        }
                    }
                } catch (error) {
                    console.error('Failed to parse zap request:', error)
                }
            }
        }

        // If we couldn't determine the amount, assume a minimum of 1 sat
        if (!foundAmount || eventAmount <= 0) {
            eventAmount = 1
        }

        return total + eventAmount
    }, 0)

    // Format the total zap amount - make sure we always show a number when there are zaps
    const formattedZapAmount =
        totalZapAmount > 0
            ? totalZapAmount >= 1000000
                ? `${(totalZapAmount / 1000000).toFixed(1)}M`
                : totalZapAmount >= 1000
                  ? `${(totalZapAmount / 1000).toFixed(1)}K`
                  : Math.round(totalZapAmount).toString()
            : allZaps.length > 0
              ? '?'
              : '' // Show '?' if we have zaps but no amount

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

    useEffect(() => {
        if (!userPubkey || allZaps.length === 0) return

        const userHasZapped = allZaps.some((zapEvent) => {
            const hasPTag = zapEvent.tags.some((tag) => (tag[0] === 'P' || tag[0] === 'p') && tag[1] === userPubkey)

            if (hasPTag) {
                return true
            }

            const descriptionTag = zapEvent.tags.find((t) => t[0] === 'description')?.[1]
            if (descriptionTag) {
                try {
                    const zapRequest = JSON.parse(descriptionTag)
                    const isUserZap = zapRequest.pubkey === userPubkey
                    return isUserZap
                } catch (error) {
                    console.error('Failed to parse zap request:', error)
                }
            }

            return false
        })

        if (userHasZapped) {
            setHasUserZapped(true)
        } else {
            setHasUserZapped(false)
        }
    }, [allZaps, userPubkey])

    useEffect(() => {
        const getUserPubkey = async () => {
            const ndk = ndkActions.getNDK()
            const user = await ndk?.signer?.user()
            setUserPubkey(user?.pubkey)
        }
        getUserPubkey()

        // Check if user has liked the content
        if (userPubkey && reactions.length > 0) {
            const hasUserReacted = reactions.some((event) => event.pubkey === userPubkey && event.content === '❤️')
            setHasUserReacted(hasUserReacted)
        }
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
        setIsZapDialogOpen(false)

        setRecentlyZapped(true)
        setTimeout(() => setRecentlyZapped(false), 3000)

        setHasUserZapped(true)

        if (zapEvent) {
            setLocalZaps((current) => {
                if (current.some((e) => e.id === zapEvent.id)) return current
                return [...current, zapEvent]
            })
        }

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
                            : `Send a zap${
                                  totalZapAmount > 0
                                      ? ` (${Math.round(totalZapAmount)} sats from ${allZaps.length} zap${allZaps.length !== 1 ? 's' : ''})`
                                      : allZaps.length > 0
                                        ? ` (${allZaps.length} zap${allZaps.length !== 1 ? 's' : ''})`
                                        : ''
                              }`
                    }
                    className={cn(compact ? 'h-7 px-1' : 'h-8 w-8')}
                >
                    <Zap className={zapButtonClassName} />
                    {compact && (
                        <span className={cn('text-xs ml-1', (hasUserZapped || recentlyZapped) && 'text-yellow-400')}>
                            {isLoadingZaps ? (
                                <span className="animate-pulse">···</span>
                            ) : totalZapAmount > 0 ? (
                                formattedZapAmount
                            ) : (
                                allZaps.length.toString()
                            )}
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
