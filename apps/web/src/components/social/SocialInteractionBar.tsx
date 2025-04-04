import { Button } from '@/components/ui/button'
import { ndkActions } from '@/lib/store/ndk'
import { cn } from '@/lib/utils'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchReactions, publishReaction } from '@wavefunc/common'
import { Heart, MessageCircle, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
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
    const [isZapDialogOpen, setIsZapDialogOpen] = useState(false)
    const [canAuthorReceiveZaps, setCanAuthorReceiveZaps] = useState<boolean | null>(null)
    const [checkingZapCapability, setCheckingZapCapability] = useState(false)

    const { data: reactions = [] } = useQuery({
        queryKey: ['reactions', event.id],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')
            return fetchReactions(ndk, event.id)
        },
        enabled: !!event.id,
    })

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

    useEffect(() => {
        const getUserPubkey = async () => {
            const ndk = ndkActions.getNDK()
            const user = await ndk?.signer?.user()
            setUserPubkey(user?.pubkey)
        }
        getUserPubkey()

        const hasUserReacted = reactions.some((event) => event.pubkey === userPubkey && event.content === '❤️')
        setHasUserReacted(hasUserReacted)
    }, [reactions, userPubkey])

    const likeCount = reactions.filter((event) => event.content === '❤️').length
    const zapCount = reactions.filter((event) => event.content === '⚡').length

    const reactionMutation = useMutation({
        mutationFn: async (content: string) => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')
            await publishReaction(ndk, event, content)
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

    const handleZapComplete = () => {
        console.log('zap complete')
        setIsZapDialogOpen(false)

        // Optional: Add a zap reaction after completing payment
        // reactionMutation.mutate('⚡')
    }

    return (
        <>
            <div className={cn('flex space-x-1', className)}>
                <Button
                    variant="ghost"
                    size={compact ? 'sm' : 'icon'}
                    aria-label="Zap"
                    onClick={handleZap}
                    disabled={reactionMutation.isPending || checkingZapCapability || canAuthorReceiveZaps === false}
                    title={canAuthorReceiveZaps === false ? 'User cannot receive zaps' : 'Send a zap to this user'}
                    className={cn(compact ? 'h-7 px-1' : 'h-8 w-8')}
                >
                    <Zap className={cn('text-primary', compact ? 'h-3 w-3 mr-1' : 'h-4 w-4')} />
                    {compact && <span className="text-xs">{zapCount}</span>}
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
                    {compact && <span className="text-xs">{likeCount}</span>}
                </Button>

                <Button
                    variant="ghost"
                    size={compact ? 'sm' : 'icon'}
                    aria-label="Comment"
                    onClick={onCommentClick}
                    className={cn(compact ? 'h-7 px-1' : 'h-8 w-8')}
                >
                    <MessageCircle className={cn('text-primary', compact ? 'h-3 w-3 mr-1' : 'h-4 w-4')} />
                    {compact && <span className="text-xs">{commentsCount}</span>}
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
