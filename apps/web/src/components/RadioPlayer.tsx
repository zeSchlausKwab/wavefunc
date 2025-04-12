'use client'

import { Button } from '@/components/ui/button'
import { stationsStore, togglePlayback } from '@/lib/store/stations'
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MusicRecognitionButton } from './MusicRecognitionButton'
import { useStore } from '@tanstack/react-store'
import { StreamMetadataDisplay } from './radio/StreamMetadataDisplay'
import { StreamTechnicalInfo } from './radio/StreamTechnicalInfo'
import { type StreamMetadata, extractStreamMetadata, setupMetadataListeners } from '@/lib/utils/streamUtils'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Headphones, Loader2, PauseCircle, PlayCircle, Radio, Volume1 } from 'lucide-react'
import { Slider } from '@/components/ui/slider'

export function RadioPlayer() {
    // Use the stationsStore directly
    const { isPlaying, currentStation } = useStore(stationsStore)

    // Local state for radio player features
    const [metadata, setMetadata] = useState<StreamMetadata | undefined>()
    const [streamUrl, setStreamUrl] = useState<string | undefined>(currentStation?.streams?.[0]?.url)
    const [isBuffering, setIsBuffering] = useState(false)
    const [error, setError] = useState<string | undefined>()
    const [showVolumeControl, setShowVolumeControl] = useState(false)
    const audioRef = useRef<HTMLAudioElement>(null)
    const [audioVolume, setAudioVolume] = useState(1)

    // Update stream URL when current station changes
    useEffect(() => {
        if (currentStation && currentStation.streams && currentStation.streams.length > 0) {
            setStreamUrl(currentStation.streams[0].url)
        }
    }, [currentStation])

    const handleVolumeChange = (value: number[]) => {
        const newVolume = value[0]
        setAudioVolume(newVolume)
        if (audioRef.current) {
            audioRef.current.volume = newVolume
        }
    }

    // Function to determine which volume icon to show
    const getVolumeIcon = () => {
        if (audioVolume === 0) return VolumeX
        if (audioVolume < 0.5) return Volume1
        return Volume2
    }

    // Get Icon dynamically
    const VolumeIcon = getVolumeIcon()

    return (
        <div className={cn('fixed bottom-0 left-0 right-0 bg-background px-4 py-3 z-30', 'border-t-4 border-black')}>
            <div className="max-w-7xl mx-auto flex flex-wrap md:flex-nowrap items-center justify-between gap-4">
                <audio ref={audioRef} src={streamUrl} autoPlay={isPlaying} className="hidden" />

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    onClick={() => togglePlayback()}
                                    variant="outline"
                                    size="icon"
                                    disabled={isBuffering || !!error}
                                    className={cn(
                                        'h-10 w-10 min-w-10 border-2 border-black',
                                        'shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]',
                                        isPlaying
                                            ? 'bg-red-500 hover:bg-red-600 text-white'
                                            : 'bg-green-500 hover:bg-green-600 text-white',
                                        'transition-transform hover:translate-y-[-2px]',
                                    )}
                                >
                                    {isBuffering ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : isPlaying ? (
                                        <PauseCircle className="h-5 w-5" />
                                    ) : (
                                        <PlayCircle className="h-5 w-5" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{isPlaying ? 'Pause' : 'Play'}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <div className="flex flex-col justify-center overflow-hidden">
                        <div className="flex items-center">
                            <Radio className="h-4 w-4 mr-2 text-green-500" />
                            <span className="font-bold text-sm truncate">
                                {currentStation?.name || 'Unknown Station'}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                            {metadata?.title ||
                                (currentStation?.description
                                    ? `${currentStation.description.slice(0, 50)}...`
                                    : 'Now Playing')}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                    {error && (
                        <div className="bg-red-100 text-red-800 px-3 py-1 rounded-md border-2 border-red-500 text-xs font-medium">
                            Error: {error}
                        </div>
                    )}

                    <div className="relative">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setShowVolumeControl(!showVolumeControl)}
                                    >
                                        <VolumeIcon className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Adjust Volume</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {showVolumeControl && (
                            <div
                                className={cn(
                                    'absolute bottom-full right-0 mb-2 p-3 bg-background',
                                    'border-2 border-black rounded-md shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]',
                                    'animate-in fade-in-50 slide-in-from-bottom-5',
                                )}
                            >
                                <Slider
                                    defaultValue={[audioVolume]}
                                    max={1}
                                    step={0.01}
                                    value={[audioVolume]}
                                    onValueChange={handleVolumeChange}
                                    className="w-32"
                                />
                            </div>
                        )}
                    </div>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                        'h-9 w-9 border-2 border-black',
                                        'shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
                                        'transition-transform hover:translate-y-[-2px]',
                                    )}
                                >
                                    <Headphones className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Station Details</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
        </div>
    )
}
