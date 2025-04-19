import { Pause } from 'lucide-react'

import { Button } from '@wavefunc/ui/components/ui/button'
import { cn } from '@wavefunc/common'
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
}: PlayButtonProps) => {
    // Function to handle click and prevent event bubbling
    const onPlayClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        handlePlay()
    }

    return (
        <Button
            size={isFullWidth && !isMobile ? 'default' : 'sm'}
            variant="secondary"
            className={cn(
                'rounded-full z-20',
                isFullWidth ? (isMobile ? 'w-10 h-10' : 'w-12 h-12') : 'w-10 h-10',
                className,
            )}
            onClick={onPlayClick}
            disabled={!hasStreams}
        >
            {isCurrentlyPlaying ? (
                <Pause className={cn(isMobile ? 'w-4 h-4' : isFullWidth ? 'w-5 h-5' : 'w-4 h-4')} />
            ) : (
                <Play className={cn(isMobile ? 'w-4 h-4' : isFullWidth ? 'w-5 h-5' : 'w-4 h-4')} />
            )}
        </Button>
    )
}
