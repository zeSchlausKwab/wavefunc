import { useAutoAnimate } from '@formkit/auto-animate/react'
import { Link as RouterLink } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { useEffect, useMemo, useState } from 'react'
import { useMedia } from 'react-use'

// UI Components
import CommentsList from '@/components/comments'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { FavoritesDropdown } from '../station/FavoritesDropdown'
import { StreamSelector } from './StreamSelector'

// Icons
import {
    Calendar,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    CircleDashed,
    ExternalLink,
    Heart,
    MessageCircle,
    Music,
    Pause,
    Pencil,
    Play,
    Plus,
    Share2,
    Star,
    Users,
    Zap,
} from 'lucide-react'

// Stores and utilities
import { ndkActions, ndkStore } from '@/lib/store/ndk'
import { setCurrentStation, stationsStore, togglePlayback } from '@/lib/store/stations'
import { openEditStationDrawer } from '@/lib/store/ui'
import { cn } from '@/lib/utils'
import { NDKUser } from '@nostr-dev-kit/ndk'
import type { Station } from '@wavefunc/common'
import { findStationByNameInNostr, generateStationNaddr } from '@wavefunc/common'
import type { Stream } from '@wavefunc/common/types/stream'

interface RadioCardProps {
    station: Station
    currentListId?: string
}

export function RadioCard({ station, currentListId }: RadioCardProps) {
    const isMobile = useMedia('(max-width: 640px)')

    const [isExpanded, setIsExpanded] = useState(false)
    const [showComments, setShowComments] = useState(false)
    const [commentsCount, setCommentsCount] = useState(0)

    const [existsInNostr, setExistsInNostr] = useState(false)
    const [checkingNostr, setCheckingNostr] = useState(false)
    const [stationNaddr, setStationNaddr] = useState<string | null>(null)
    const [user, setUser] = useState<NDKUser | null>(null)

    const [selectedStreamId, setSelectedStreamId] = useState<number | undefined>(undefined)

    const isPlaying = useStore(stationsStore, (state) => state.isPlaying)
    const currentStation = useStore(stationsStore, (state) => state.currentStation)
    const isCurrentlyPlaying = currentStation?.id === station.id && isPlaying
    const { isConnected, ndk } = useStore(ndkStore)

    const [cardRef] = useAutoAnimate<HTMLDivElement>({
        duration: 300,
        easing: 'ease-in-out',
    })

    const [contentRef] = useAutoAnimate<HTMLDivElement>({
        duration: 300,
        easing: 'ease-out',
    })

    const [commentsRef] = useAutoAnimate<HTMLDivElement>({
        duration: 400,
        easing: 'ease-in-out',
    })

    // Check if station exists in Nostr
    useEffect(() => {
        let isMounted = true

        if (!isConnected) return

        const checkNostr = async () => {
            if (!station.name) return

            try {
                setCheckingNostr(true)

                if (!ndk) {
                    throw new Error('NDK not initialized')
                }

                if (!isMounted) return

                const nostrEvent = await findStationByNameInNostr(ndk, station.name)
                if (!isMounted) return

                setExistsInNostr(!!nostrEvent)

                if (nostrEvent) {
                    try {
                        const naddr = generateStationNaddr(nostrEvent)
                        setStationNaddr(naddr)
                    } catch (error) {
                        console.error('Error generating naddr:', error)
                    }
                }
            } catch (error) {
                console.error('Error checking Nostr for station:', error)
            } finally {
                if (isMounted) {
                    setCheckingNostr(false)
                }
            }
        }

        checkNostr()

        return () => {
            isMounted = false
        }
    }, [station.name, isConnected, ndk])

    // Get current user
    useEffect(() => {
        const getUser = async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) return

            const user = await ndk.signer?.user()
            if (user) {
                setUser(user)
            }
        }
        getUser()
    }, [station.pubkey])

    // Stream handler
    const handleStreamSelect = (stream: Stream) => {
        setSelectedStreamId(stream.quality.bitrate)
    }

    // Play/Pause handler
    const handlePlay = () => {
        if (!station.streams || !Array.isArray(station.streams) || station.streams.length === 0) {
            return
        }

        const selectedStream =
            station.streams.find((s) => s.quality.bitrate === selectedStreamId) ||
            station.streams.find((s) => s.primary) ||
            station.streams[0]

        if (selectedStream) {
            const stationToPlay = {
                ...station,
                streams: [selectedStream],
            }

            setCurrentStation(stationToPlay)

            if (currentStation?.id !== station.id || !isPlaying) {
                togglePlayback()
            }
        }
    }

    // Edit station handler
    const handleEdit = () => {
        openEditStationDrawer(station)
    }

    // Comments visibility handler
    const toggleComments = () => {
        setShowComments(!showComments)
        if (!showComments && !isExpanded) {
            setIsExpanded(true)
        }
    }

    // Reset comments when collapsing
    useEffect(() => {
        if (!isExpanded) {
            setShowComments(false)
        }
    }, [isExpanded])

    // Extract tags from station
    const stationTags = useMemo(() => {
        if (!station.tags || !Array.isArray(station.tags)) {
            return []
        }
        return station.tags
            .filter((tag) => tag[0] !== 'd' && tag[0] !== 'genre' && tag[0] !== 'thumbnail')
            .map((tag) => tag[1] || tag[0])
            .filter(Boolean)
    }, [station.tags])

    // Determine if card should be rendered as expanded (full width) when on Nostr
    const isFullWidth = isExpanded && existsInNostr

    return (
        <Card
            ref={cardRef}
            className={cn(
                'transition-all duration-300 bg-white bg-opacity-90 shadow-lg overflow-hidden flex flex-col',
                existsInNostr ? 'border-green-500 border-2' : '',
                isFullWidth ? 'col-span-full w-full' : 'h-full h-[280px]',
            )}
        >
            <div ref={contentRef} className="flex flex-col h-full">
                <div
                    className={cn(
                        'flex h-full',
                        isMobile ? 'flex-row' : isFullWidth ? 'flex-row' : 'flex-row items-start',
                    )}
                >
                    {/* Image section */}
                    <div
                        className={cn(
                            'relative shrink-0',
                            isFullWidth
                                ? isMobile
                                    ? 'w-32 h-32'
                                    : 'w-64 h-64'
                                : isMobile
                                  ? 'w-24 h-24'
                                  : 'w-32 h-32 m-2',
                        )}
                    >
                        <img
                            src={station.imageUrl || '/placeholder-station.png'}
                            alt={station.name || 'Station'}
                            className="w-full h-full object-cover rounded-md"
                        />
                        {!isFullWidth && (
                            <div className="absolute bottom-0 right-0 flex gap-1 p-1">
                                <Button
                                    size="icon"
                                    variant="secondary"
                                    className="rounded-full w-7 h-7"
                                    onClick={handlePlay}
                                    disabled={
                                        !station.streams ||
                                        !Array.isArray(station.streams) ||
                                        station.streams.length === 0
                                    }
                                >
                                    {isCurrentlyPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                </Button>
                                {!existsInNostr && (
                                    <Button
                                        size="icon"
                                        variant="secondary"
                                        className="rounded-full w-7 h-7"
                                        onClick={handleEdit}
                                    >
                                        <Plus className="w-3 h-3" />
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Content section */}
                    <div className="grow min-w-0 flex flex-col h-full">
                        <CardHeader className={cn(isMobile ? 'p-3' : 'p-4 pb-2')}>
                            <div className="flex items-center justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                        {existsInNostr && stationNaddr ? (
                                            <RouterLink
                                                to="/station/$naddr"
                                                params={{ naddr: stationNaddr }}
                                                className="hover:underline flex items-center gap-1"
                                            >
                                                <CardTitle
                                                    className={cn(
                                                        'font-press-start-2p truncate text-primary',
                                                        isMobile ? 'text-xs' : 'text-sm',
                                                    )}
                                                >
                                                    {station.name}
                                                </CardTitle>
                                                <ExternalLink className="w-3 h-3 text-primary" />
                                            </RouterLink>
                                        ) : (
                                            <CardTitle
                                                className={cn(
                                                    'font-press-start-2p truncate text-primary',
                                                    isMobile ? 'text-xs' : 'text-sm',
                                                )}
                                            >
                                                {station.name}
                                            </CardTitle>
                                        )}
                                        {checkingNostr ? (
                                            <CircleDashed className="w-4 h-4 animate-spin text-muted-foreground" />
                                        ) : existsInNostr ? (
                                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                                        ) : null}
                                    </div>
                                    <CardDescription
                                        className={cn(
                                            'font-press-start-2p mt-1 truncate',
                                            isMobile ? 'text-[10px]' : 'text-xs',
                                        )}
                                    >
                                        {station.genre}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center space-x-1">
                                    {!isFullWidth &&
                                        station.streams &&
                                        Array.isArray(station.streams) &&
                                        station.streams.length > 1 && (
                                            <div className={cn('shrink-0', isMobile ? 'w-16' : 'w-24')}>
                                                {station.id && !isNaN(Number(station.id)) ? (
                                                    <StreamSelector
                                                        stationId={Number(station.id)}
                                                        onStreamSelect={handleStreamSelect}
                                                        selectedStreamId={selectedStreamId}
                                                        streams={station.streams}
                                                    />
                                                ) : null}
                                            </div>
                                        )}
                                    {isFullWidth && (
                                        <>
                                            <Button
                                                variant="ghost"
                                                size={isMobile ? 'sm' : 'icon'}
                                                onClick={handlePlay}
                                                className="shrink-0"
                                                disabled={
                                                    !station.streams ||
                                                    !Array.isArray(station.streams) ||
                                                    station.streams.length === 0
                                                }
                                            >
                                                {isCurrentlyPlaying ? (
                                                    <Pause className="h-4 w-4 text-primary" />
                                                ) : (
                                                    <Play className="h-4 w-4 text-primary" />
                                                )}
                                            </Button>

                                            {existsInNostr && (
                                                <Button
                                                    variant="ghost"
                                                    size={isMobile ? 'sm' : 'icon'}
                                                    onClick={() => setIsExpanded(!isExpanded)}
                                                    className="shrink-0"
                                                >
                                                    {isExpanded ? (
                                                        <ChevronUp className="h-4 w-4 text-primary" />
                                                    ) : (
                                                        <ChevronDown className="h-4 w-4 text-primary" />
                                                    )}
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className={cn(isMobile ? 'p-3 pt-0' : 'p-4 pt-0 pb-2', 'flex-grow')}>
                            <p className={cn('font-press-start-2p line-clamp-3', isMobile ? 'text-[10px]' : 'text-xs')}>
                                {station.description}
                            </p>

                            {/* Tag pills */}
                            {stationTags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1 overflow-hidden h-6">
                                    {stationTags.slice(0, isMobile ? 2 : 3).map((tag, index) => (
                                        <span
                                            key={index}
                                            className={cn(
                                                'inline-block bg-primary/10 text-primary rounded-full whitespace-nowrap overflow-hidden text-ellipsis',
                                                isMobile
                                                    ? 'px-2 py-0.5 text-[8px] max-w-16'
                                                    : 'px-2 py-0.5 text-xs max-w-24',
                                            )}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                    {stationTags.length > (isMobile ? 2 : 3) && (
                                        <span
                                            className={cn(
                                                'inline-block bg-gray-100 text-gray-500 rounded-full',
                                                isMobile ? 'px-2 py-0.5 text-[8px]' : 'px-2 py-0.5 text-xs',
                                            )}
                                        >
                                            +{stationTags.length - (isMobile ? 2 : 3)}
                                        </span>
                                    )}
                                </div>
                            )}

                            {!isFullWidth && !isMobile && (
                                <div className="mt-2 flex items-center justify-between">
                                    {station.streams &&
                                        Array.isArray(station.streams) &&
                                        station.streams.length > 0 && (
                                            <div className="text-xs text-muted-foreground line-clamp-1">
                                                <span className="font-press-start-2p">
                                                    {station.streams.find((s) => s.primary)?.quality?.bitrate ||
                                                        station.streams[0]?.quality?.bitrate ||
                                                        'Unknown'}{' '}
                                                    kbps
                                                </span>
                                            </div>
                                        )}
                                    {existsInNostr && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setIsExpanded(!isExpanded)}
                                            className="h-6 px-1 text-xs"
                                        >
                                            {isExpanded ? 'Less' : 'More'}
                                            {isExpanded ? (
                                                <ChevronUp className="h-3 w-3 ml-1" />
                                            ) : (
                                                <ChevronDown className="h-3 w-3 ml-1" />
                                            )}
                                        </Button>
                                    )}
                                </div>
                            )}
                        </CardContent>

                        {/* Compact footer for non-expanded cards - aligned at bottom */}
                        {!isFullWidth && (
                            <CardFooter
                                className={cn(
                                    'mt-auto flex flex-row-reverse justify-between gap-1',
                                    isMobile ? 'p-3 pt-0' : 'p-4 pt-0 pb-2',
                                )}
                            >
                                <div className="flex space-x-1">
                                    <Button variant="ghost" size="sm" aria-label="Flash" className="h-7 px-1">
                                        <Zap className="h-3 w-3 mr-1" />
                                        <span className="text-xs">0</span>
                                    </Button>
                                    <Button variant="ghost" size="sm" aria-label="Heart" className="h-7 px-1">
                                        <Heart className="h-3 w-3 mr-1" />
                                        <span className="text-xs">0</span>
                                    </Button>
                                    {existsInNostr && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            aria-label="Comment"
                                            onClick={toggleComments}
                                            className="h-7 px-1"
                                        >
                                            <MessageCircle className="h-3 w-3 mr-1" />
                                            <span className="text-xs">{commentsCount}</span>
                                        </Button>
                                    )}
                                    <Button variant="ghost" size="sm" aria-label="Share" className="h-7 px-1">
                                        <Share2 className="h-3 w-3 mr-1" />
                                        <span className="text-xs"></span>
                                    </Button>
                                </div>

                                <div className="flex items-center space-x-2">
                                    {existsInNostr && station && station.id && (
                                        <FavoritesDropdown station={station} currentListId={currentListId} />
                                    )}
                                    {station.pubkey === user?.pubkey && (
                                        <Button
                                            onClick={handleEdit}
                                            className={cn(
                                                'bg-secondary hover:bg-secondary-foreground text-primary hover:text-white',
                                                'h-7 px-2 text-[10px]',
                                            )}
                                            size="sm"
                                        >
                                            <Pencil className="h-3 w-3 mr-1" />
                                            Edit
                                        </Button>
                                    )}
                                </div>
                            </CardFooter>
                        )}

                        {/* Full footer only for expanded cards */}
                        {isFullWidth && (
                            <CardFooter className={cn('flex flex-row-reverse justify-between', isMobile && 'p-3')}>
                                <div className="flex space-x-1">
                                    <Button
                                        variant="ghost"
                                        size={isMobile ? 'sm' : 'icon'}
                                        aria-label="Flash"
                                        className="h-8 w-8"
                                    >
                                        <Zap className="h-4 w-4 text-primary" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size={isMobile ? 'sm' : 'icon'}
                                        aria-label="Heart"
                                        className="h-8 w-8"
                                    >
                                        <Heart className="h-4 w-4 text-primary" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size={isMobile ? 'sm' : 'icon'}
                                        aria-label="Comment"
                                        onClick={toggleComments}
                                        className="h-8 w-8"
                                    >
                                        <MessageCircle className="h-4 w-4 text-primary" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size={isMobile ? 'sm' : 'icon'}
                                        aria-label="Share"
                                        className="h-8 w-8"
                                    >
                                        <Share2 className="h-4 w-4 text-primary" />
                                    </Button>
                                </div>
                                {station.pubkey === user?.pubkey && (
                                    <Button
                                        onClick={handleEdit}
                                        className={cn(
                                            'bg-secondary hover:bg-secondary-foreground text-primary hover:text-white font-press-start-2p',
                                            isMobile ? 'text-[10px] py-1 px-2 h-7' : 'text-xs',
                                        )}
                                        size="sm"
                                    >
                                        <Pencil className="h-3 w-3 mr-1" />
                                        Edit
                                    </Button>
                                )}
                            </CardFooter>
                        )}
                    </div>
                </div>

                {/* Expanded content only shown when expanded and exists in nostr */}
                {isExpanded && existsInNostr && (
                    <div className={cn('bg-gray-100', isMobile ? 'p-3' : 'p-4')}>
                        <div className="flex items-center mb-3">
                            <div className="w-8 h-8 rounded-full bg-primary mr-2"></div>
                            <div>
                                <p
                                    className={cn(
                                        'font-semibold font-press-start-2p',
                                        isMobile ? 'text-[10px]' : 'text-sm',
                                    )}
                                >
                                    {user?.profile?.name || 'Anonymous'}
                                </p>
                                <p
                                    className={cn(
                                        'text-gray-500 font-press-start-2p',
                                        isMobile ? 'text-[8px]' : 'text-xs',
                                    )}
                                >
                                    Station Creator
                                </p>
                            </div>
                        </div>

                        <div className="mb-3">
                            <h3 className={cn('font-semibold', isMobile ? 'text-[10px] mb-1' : 'text-xs mb-2')}>
                                Add to Nostr Favorites
                            </h3>
                            {existsInNostr && station && station.id && (
                                <FavoritesDropdown station={station} currentListId={currentListId} />
                            )}
                        </div>

                        <div className={cn('grid gap-2 mb-3', isMobile ? 'grid-cols-1' : 'grid-cols-2 gap-4')}>
                            <div className="flex items-center">
                                <Music className="h-4 w-4 text-primary mr-2" />
                                <span className={cn('font-press-start-2p', isMobile ? 'text-[10px]' : 'text-xs')}>
                                    Tracks: 1000+
                                </span>
                            </div>
                            <div className="flex items-center">
                                <Users className="h-4 w-4 text-primary mr-2" />
                                <span className={cn('font-press-start-2p', isMobile ? 'text-[10px]' : 'text-xs')}>
                                    Listeners: 5k
                                </span>
                            </div>
                            <div className="flex items-center">
                                <Calendar className="h-4 w-4 text-primary mr-2" />
                                <span className={cn('font-press-start-2p', isMobile ? 'text-[10px]' : 'text-xs')}>
                                    Since: 2020
                                </span>
                            </div>
                            <div className="flex items-center">
                                <Star className="h-4 w-4 text-primary mr-2" />
                                <span className={cn('font-press-start-2p', isMobile ? 'text-[10px]' : 'text-xs')}>
                                    Rating: 4.8
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Comments section - Only visible when both showComments is true and card is expanded */}
                {showComments && isExpanded && existsInNostr && (
                    <div ref={commentsRef} className={cn('bg-gray-50 border-t', isMobile ? 'p-3' : 'p-4')}>
                        {station.id ? (
                            <CommentsList stationId={station.id} stationEvent={station} commentsCount={commentsCount} />
                        ) : (
                            <div className="text-center py-4 text-muted-foreground">
                                Cannot load comments for this station.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Card>
    )
}
