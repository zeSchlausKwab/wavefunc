import { Button } from '@/components/ui/button'
import { Heart, MessageCircle, Share2, Zap } from 'lucide-react'
import { useState, useEffect } from 'react'
import { ShareStationButton } from '../ShareStationButton'
import { cn } from '@/lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ndkActions } from '@/lib/store/ndk'
import { fetchReactions, publishReaction } from '@wavefunc/common/'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { toast } from 'sonner'

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

    const { data: reactions = [] } = useQuery({
        queryKey: ['reactions', event.id],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')
            return fetchReactions(ndk, event.id)
        },
        enabled: !!event.id,
    })

    useEffect(() => {
        const getUserPubkey = async () => {
            const ndk = ndkActions.getNDK()
            const user = await ndk?.signer?.user()
            setUserPubkey(user?.pubkey)
        }
        getUserPubkey()

        const hasUserReacted = reactions.some((event) => event.pubkey === userPubkey && event.content === '❤️')
        setHasUserReacted(hasUserReacted)
    }, [reactions])

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
        reactionMutation.mutate('⚡')
    }

    const handleLike = () => {
        reactionMutation.mutate('❤️')
    }

    return (
        <div className={cn('flex space-x-1', className)}>
            <Button
                variant="ghost"
                size={compact ? 'sm' : 'icon'}
                aria-label="Zap"
                onClick={handleZap}
                disabled={reactionMutation.isPending}
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
    )
}
