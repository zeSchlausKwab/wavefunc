import { Button } from '@/components/ui/button'
import { Heart, MessageCircle, Share2, Zap } from 'lucide-react'
import { useState } from 'react'
import { ShareStationButton } from '../ShareStationButton'
import { cn } from '@/lib/utils'

interface SocialInteractionBarProps {
    naddr: string
    authorPubkey: string
    commentsCount?: number
    onCommentClick?: () => void
    className?: string
    compact?: boolean
}

export function SocialInteractionBar({
    naddr,
    authorPubkey,
    commentsCount = 0,
    onCommentClick,
    className = '',
    compact = false,
}: SocialInteractionBarProps) {
    const [zapCount, setZapCount] = useState(0)
    const [likeCount, setLikeCount] = useState(0)

    // Mock handlers for zap and like
    const handleZap = () => {
        // TODO: Implement zap functionality
        setZapCount((prev) => prev + 1)
    }

    const handleLike = () => {
        // TODO: Implement like functionality
        setLikeCount((prev) => prev + 1)
    }

    return (
        <div className={cn('flex space-x-1', className)}>
            <Button
                variant="ghost"
                size={compact ? 'sm' : 'icon'}
                aria-label="Zap"
                onClick={handleZap}
                className={cn(compact ? 'h-7 px-1' : 'h-8 w-8')}
            >
                <Zap className={cn('text-primary', compact ? 'h-3 w-3 mr-1' : 'h-4 w-4')} />
                {compact && <span className="text-xs">{zapCount}</span>}
            </Button>

            <Button
                variant="ghost"
                size={compact ? 'sm' : 'icon'}
                aria-label="Like"
                onClick={handleLike}
                className={cn(compact ? 'h-7 px-1' : 'h-8 w-8')}
            >
                <Heart className={cn('text-primary', compact ? 'h-3 w-3 mr-1' : 'h-4 w-4')} />
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

            <ShareStationButton stationId={naddr} stationName={naddr} className={cn(compact ? 'h-7 w-7' : 'h-8 w-8')} />
        </div>
    )
} 