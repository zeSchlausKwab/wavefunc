import { Button } from '@wavefunc/ui/components/ui/button'
import { ndkActions } from '@wavefunc/common'
import { cn } from '@wavefunc/common'
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

/**
 * Extracts and calculates the amount from a zap event
 */
function extractZapAmount(zapEvent: NDKEvent): number {
    const amountTag = zapEvent.tags.find((tag) => tag[0] === 'amount')
    if (amountTag && amountTag[1]) {
        try {
            return parseInt(amountTag[1], 10) / 1000 || 0
        } catch (e) {
            console.error(`Error parsing amount tag: ${amountTag[1]}`, e)
        }
    }

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

            return amount * 100000000 // Convert to sats
        }
    }

    const descriptionTag = zapEvent.tags.find((tag) => tag[0] === 'description')?.[1]
    if (descriptionTag) {
        try {
            const zapRequest = JSON.parse(descriptionTag)

            const requestAmountTag = zapRequest.tags?.find((tag: string[]) => tag[0] === 'amount')?.[1]
            if (requestAmountTag) {
                return parseInt(requestAmountTag, 10) / 1000 || 0
            }

            const bolt11 = zapEvent.tags.find((tag) => tag[0] === 'bolt11')?.[1]
            if (bolt11) {
                const match = bolt11.match(/lnbc(\d+)([munp])?1/)
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

                    return amount * 100000000 // Convert to sats
                }
            }
        } catch (error) {
            console.error('Failed to parse zap request:', error)
        }
    }

    return 1
}

/**
 * Formats a number of sats into a human-readable string
 */
function formatSatsAmount(amount: number): string {
    if (amount >= 1000000) {
        return `${(amount / 1000000).toFixed(1)}M`
    } else if (amount >= 1000) {
        return `${(amount / 1000).toFixed(1)}K`
    }
    return Math.round(amount).toString()
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

    const zapSubscriptionRef = useRef<NDKSubscription | null>(null)

    const { data: reactions = [] } = useQuery({
        queryKey: ['reactions', event.id],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')
            return fetchReactions(ndk as any, event.id)
        },
        enabled: !!event.id,
    })

    const { data: zaps = [], isLoading: isLoadingZaps } = useQuery({
        queryKey: ['zaps', event.id],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

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
                if (current.some((e) => e.id === zapEvent.id)) return current
                return [...current, zapEvent]
            })

            queryClient.invalidateQueries({ queryKey: ['zaps', event.id] })

            if (userPubkey) {
                const isFromUser = checkIfZapIsFromUser(zapEvent, userPubkey)

                if (isFromUser) {
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
        return total + extractZapAmount(zapEvent)
    }, 0)

    const formattedZapAmount = totalZapAmount > 0 ? formatSatsAmount(totalZapAmount) : allZaps.length > 0 ? '?' : ''

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

        const userHasZapped = allZaps.some((zapEvent) => checkIfZapIsFromUser(zapEvent, userPubkey))

        setHasUserZapped(userHasZapped)
    }, [allZaps, userPubkey])

    useEffect(() => {
        const getUserPubkey = async () => {
            const ndk = ndkActions.getNDK()
            const user = await ndk?.signer?.user()
            setUserPubkey(user?.pubkey)
        }
        getUserPubkey()

        if (userPubkey && reactions.length > 0) {
            const hasUserReacted = reactions.some((event) => event.pubkey === userPubkey && event.content === '❤️')
            setHasUserReacted(hasUserReacted)
        }
    }, [reactions, userPubkey])

    const checkIfZapIsFromUser = (zapEvent: NDKEvent, userPk: string): boolean => {
        const hasPTag = zapEvent.tags.some((tag) => (tag[0] === 'P' || tag[0] === 'p') && tag[1] === userPk)

        if (hasPTag) return true

        const descriptionTag = zapEvent.tags.find((t) => t[0] === 'description')?.[1]
        if (descriptionTag) {
            try {
                const zapRequest = JSON.parse(descriptionTag)
                return zapRequest.pubkey === userPk
            } catch (error) {
                // Ignore parsing errors
            }
        }

        return false
    }

    const likeCount = reactions.filter((event) => event.content === '❤️').length

    const reactionMutation = useMutation({
        mutationFn: async (content: string) => {
            await publishReaction(event as any, content)
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

    // CSS classes
    const zapButtonClassName = cn(
        compact ? 'h-3 w-3 mr-1' : 'h-4 w-4',
        recentlyZapped
            ? 'fill-yellow-400 text-yellow-400 animate-pulse'
            : hasUserZapped
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-primary',
    )

    const getZapTooltip = () => {
        if (canAuthorReceiveZaps === false) {
            return 'User cannot receive zaps'
        }

        let tooltip = 'Send a zap'

        if (totalZapAmount > 0) {
            tooltip += ` (${Math.round(totalZapAmount)} sats from ${allZaps.length} zap${allZaps.length !== 1 ? 's' : ''})`
        } else if (allZaps.length > 0) {
            tooltip += ` (${allZaps.length} zap${allZaps.length !== 1 ? 's' : ''})`
        }

        return tooltip
    }

    return (
        <>
            <div className={cn('flex space-x-1', className)}>
                <Button
                    variant="outline"
                    size={compact ? 'sm' : 'icon'}
                    aria-label="Zap"
                    onClick={handleZap}
                    disabled={reactionMutation.isPending || checkingZapCapability || canAuthorReceiveZaps === false}
                    title={getZapTooltip()}
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
                    variant="outline"
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
                    variant="outline"
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
