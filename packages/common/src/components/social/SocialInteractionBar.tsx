import { Button } from '@wavefunc/ui/components/ui/button'
import { ndkActions, authStore } from '@wavefunc/common'
import { cn } from '@wavefunc/common'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchReactions, publishReaction } from '@wavefunc/common'
import { useZapReceiptsWithRealtime, useZapSummary } from '@wavefunc/common'
import { Heart, MessageCircle, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from '@tanstack/react-store'
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
    const user = useStore(authStore, (state) => state.user)
    const userPubkey = user?.pubkey
    const [hasUserReacted, setHasUserReacted] = useState(false)
    const [hasUserZapped, setHasUserZapped] = useState(false)
    const [isZapDialogOpen, setIsZapDialogOpen] = useState(false)
    const [canAuthorReceiveZaps, setCanAuthorReceiveZaps] = useState<boolean | null>(null)
    const [checkingZapCapability, setCheckingZapCapability] = useState(false)
    const [recentlyZapped, setRecentlyZapped] = useState(false)

    // Use the new query system for reactions (keeping old approach for now)
    const { data: reactions = [] } = useQuery({
        queryKey: ['reactions', event.id],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')
            return fetchReactions(ndk as any, event.id)
        },
        enabled: !!event.id,
    })

    // Use the new zap query hooks with real-time updates
    const { data: zapReceipts = [] } = useZapReceiptsWithRealtime(event.id || '', undefined, {
        enabled: !!event.id,
    })

    const { data: zapSummary } = useZapSummary(event.id || '', {
        enabled: !!event.id,
    })

    // Extract zap data from the new query system
    const totalZapAmount = zapSummary?.total || 0
    const zapCount = zapSummary?.count || zapReceipts.length
    const formattedZapAmount = totalZapAmount > 0 ? formatSatsAmount(totalZapAmount) : zapCount > 0 ? '?' : ''

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
        if (!userPubkey || zapReceipts.length === 0) return

        const userHasZapped = zapReceipts.some((receipt) => {
            // Check if this zap was sent by the current user
            return receipt.sender === userPubkey
        })

        setHasUserZapped(userHasZapped)
    }, [zapReceipts, userPubkey])

    useEffect(() => {
        if (userPubkey && reactions.length > 0) {
            const hasUserReacted = reactions.some((event) => event.pubkey === userPubkey && event.content === '❤️')
            setHasUserReacted(hasUserReacted)
        }
    }, [reactions, userPubkey])

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

        // Invalidate zap queries to refresh the data
        queryClient.invalidateQueries({ queryKey: ['zaps'] })
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
            tooltip += ` (${Math.round(totalZapAmount)} sats from ${zapCount} zap${zapCount !== 1 ? 's' : ''})`
        } else if (zapCount > 0) {
            tooltip += ` (${zapCount} zap${zapCount !== 1 ? 's' : ''})`
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
                            {totalZapAmount > 0 ? formattedZapAmount : zapCount.toString()}
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
