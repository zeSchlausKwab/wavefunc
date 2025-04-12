import { Pause } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Play } from 'lucide-react'

// Play button component
interface PlayButtonProps {
    className?: string
    isCurrentlyPlaying: boolean
    handlePlay: () => void
    hasStreams: boolean
    isMobile: boolean
    isFullWidth: boolean
}

export const PlayButton = ({
    isCurrentlyPlaying,
    handlePlay,
    hasStreams,
    isMobile,
    isFullWidth,
    className,
}: PlayButtonProps) => (
    <Button
        size={isFullWidth && !isMobile ? 'default' : 'sm'}
        variant="secondary"
        className={cn('rounded-full', isFullWidth ? (isMobile ? 'w-10 h-10' : 'w-12 h-12') : 'w-10 h-10', className)}
        onClick={handlePlay}
        disabled={!hasStreams}
    >
        {isCurrentlyPlaying ? (
            <Pause className={cn(isMobile ? 'w-4 h-4' : isFullWidth ? 'w-5 h-5' : 'w-4 h-4')} />
        ) : (
            <Play className={cn(isMobile ? 'w-4 h-4' : isFullWidth ? 'w-5 h-5' : 'w-4 h-4')} />
        )}
    </Button>
)
