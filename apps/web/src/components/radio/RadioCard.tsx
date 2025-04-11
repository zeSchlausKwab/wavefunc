import { useAutoAnimate } from '@formkit/auto-animate/react'
import { Link as RouterLink } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { useEffect, useMemo, useState } from 'react'
import { useMedia } from 'react-use'

// UI Components
import CommentsList from '@/components/comments'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { SocialInteractionBar } from '../social/SocialInteractionBar'
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
    Music,
    Pause,
    Play,
    Plus,
    Star,
    Users,
} from 'lucide-react'

// Stores and utilities
import { ndkActions, ndkStore } from '@/lib/store/ndk'
import { setCurrentStation, stationsStore, togglePlayback } from '@/lib/store/stations'
import { openEditStationDrawer } from '@/lib/store/ui'
import { cn } from '@/lib/utils'
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk'
import type { Station } from '@wavefunc/common'
import { findStationByNameInNostr, generateStationNaddr } from '@wavefunc/common'
import type { Stream } from '@wavefunc/common/types/stream'
import { UserProfile } from '../UserProfile'

// Define sub-components to break down the complexity
// Station image with play controls
interface StationImageProps {
    station: Station
    isFullWidth: boolean
    isMobile: boolean
}

const StationImage = ({ station, isFullWidth, isMobile }: StationImageProps) => (
    <div
        className={cn(
            'relative shrink-0',
            isFullWidth ? (isMobile ? 'w-28 h-28' : 'w-64 h-64') : isMobile ? 'w-20 h-20' : 'w-32 h-32 m-2',
        )}
    >
        <img
            src={station.imageUrl || '/placeholder-station.png'}
            alt={station.name || 'Station'}
            className="w-full h-full object-cover rounded-md"
        />
    </div>
)

// Component for station tags display
interface StationTagsProps {
    tags: string[]
    isMobile: boolean
}

const StationTags = ({ tags, isMobile }: StationTagsProps) => {
    if (!tags || tags.length === 0) return null

    return (
        <div className="mt-1 flex flex-wrap gap-1 overflow-hidden h-6">
            {tags.slice(0, isMobile ? 2 : 3).map((tag: string, index: number) => (
                <span
                    key={index}
                    className={cn(
                        'inline-block bg-primary/10 text-primary rounded-full whitespace-nowrap overflow-hidden text-ellipsis',
                        isMobile ? 'px-2 py-0.5 text-[8px] max-w-14' : 'px-2 py-0.5 text-xs max-w-24',
                    )}
                >
                    {tag}
                </span>
            ))}
            {tags.length > (isMobile ? 2 : 3) && (
                <span
                    className={cn(
                        'inline-block bg-gray-100 text-gray-500 rounded-full',
                        isMobile ? 'px-2 py-0.5 text-[8px]' : 'px-2 py-0.5 text-xs',
                    )}
                >
                    +{tags.length - (isMobile ? 2 : 3)}
                </span>
            )}
        </div>
    )
}

// Station header component
interface StationHeaderProps {
    station: Station
    existsInNostr: NDKEvent | null
    stationNaddr: string | null
    checkingNostr: boolean
    isMobile: boolean
    isFullWidth: boolean
    streams?: Stream[]
    selectedStreamId?: number
    handleStreamSelect: (stream: Stream) => void
}

const StationHeader = ({
    station,
    existsInNostr,
    stationNaddr,
    checkingNostr,
    isMobile,
    isFullWidth,
    streams,
    selectedStreamId,
    handleStreamSelect,
}: StationHeaderProps) => (
    <CardHeader className={cn(isMobile ? 'p-2' : 'p-4 pb-2')}>
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
                                    'truncate text-primary',
                                    isMobile ? 'text-xs' : 'text-sm',
                                    'font-heading',
                                )}
                            >
                                {station.name}
                            </CardTitle>
                            <ExternalLink className="w-3 h-3 text-primary" />
                        </RouterLink>
                    ) : (
                        <CardTitle
                            className={cn('truncate text-primary', isMobile ? 'text-xs' : 'text-sm', 'font-heading')}
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
                <CardDescription className={cn('mt-1 truncate', isMobile ? 'text-[8px]' : 'text-xs')}>
                    {station.genre}
                </CardDescription>
            </div>
            {/* Only show stream selector in header on desktop */}
            {!isFullWidth && !isMobile && streams && Array.isArray(streams) && streams.length > 1 && (
                <div className="shrink-0 w-24">
                    {station.id && !isNaN(Number(station.id)) ? (
                        <StreamSelector
                            stationId={Number(station.id)}
                            onStreamSelect={handleStreamSelect}
                            selectedStreamId={selectedStreamId}
                            streams={streams}
                        />
                    ) : null}
                </div>
            )}
        </div>
    </CardHeader>
)

// Station main content component
interface StationContentProps {
    station: Station
    stationTags: string[]
    isMobile: boolean
    isFullWidth: boolean
    existsInNostr: NDKEvent | null
    isExpanded: boolean
    setIsExpanded: (expanded: boolean) => void
}

const StationContent = ({
    station,
    stationTags,
    isMobile,
    isFullWidth,
    existsInNostr,
    isExpanded,
    setIsExpanded,
}: StationContentProps) => (
    <CardContent className={cn(isMobile ? 'p-2 pt-0' : 'p-4 pt-0 pb-2', 'flex-grow flex flex-col')}>
        <div className="flex-grow">
            <p className={cn('line-clamp-2', isMobile ? 'text-[8px]' : 'text-xs')}>{station.description}</p>

            <StationTags tags={stationTags} isMobile={isMobile} />
        </div>

        {!isFullWidth && !isMobile && (
            <div className="mt-auto pt-2 flex items-center justify-between">
                {station.streams && Array.isArray(station.streams) && station.streams.length > 0 && (
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
                        {isExpanded ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                    </Button>
                )}
            </div>
        )}
    </CardContent>
)

// Play button component
interface PlayButtonProps {
    isCurrentlyPlaying: boolean
    handlePlay: () => void
    hasStreams: boolean
    isMobile: boolean
    isFullWidth: boolean
}

const PlayButton = ({ isCurrentlyPlaying, handlePlay, hasStreams, isMobile, isFullWidth }: PlayButtonProps) => (
    <Button
        size={isFullWidth && !isMobile ? 'default' : 'sm'}
        variant="secondary"
        className={cn('rounded-full', isFullWidth ? (isMobile ? 'w-7 h-7' : 'w-8 h-8') : 'w-7 h-7')}
        onClick={handlePlay}
        disabled={!hasStreams}
    >
        {isCurrentlyPlaying ? (
            <Pause className={cn(isMobile ? 'w-3 h-3' : isFullWidth ? 'w-4 h-4' : 'w-3 h-3')} />
        ) : (
            <Play className={cn(isMobile ? 'w-3 h-3' : isFullWidth ? 'w-4 h-4' : 'w-3 h-3')} />
        )}
    </Button>
)

// Expand/collapse button component
interface ExpandButtonProps {
    isExpanded: boolean
    setIsExpanded: (expanded: boolean) => void
    isMobile: boolean
    isFullWidth: boolean
}

const ExpandButton = ({ isExpanded, setIsExpanded, isMobile, isFullWidth }: ExpandButtonProps) => (
    <Button
        variant={isFullWidth ? 'default' : 'ghost'}
        size={isFullWidth ? (isMobile ? 'sm' : 'icon') : 'sm'}
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
            isFullWidth ? (isMobile ? 'px-3 py-1 ml-1 h-8' : 'shrink-0') : 'h-6 px-1',
            isMobile ? 'text-[10px]' : 'text-xs',
        )}
    >
        {(!isFullWidth || isMobile) && (isExpanded ? 'Less' : 'More')}
        {isExpanded ? (
            <ChevronUp className={cn(isMobile ? 'h-3 w-3 ml-1' : 'h-4 w-4')} />
        ) : (
            <ChevronDown className={cn(isMobile ? 'h-3 w-3 ml-1' : 'h-4 w-4')} />
        )}
    </Button>
)

// Station stats component for expanded view
interface StationStatsProps {
    isMobile: boolean
}

const StationStats = ({ isMobile }: StationStatsProps) => (
    <div className={cn('grid gap-2 mb-3', isMobile ? 'grid-cols-1' : 'grid-cols-2 gap-4')}>
        <div className="flex items-center">
            <Music className="h-4 w-4 text-primary mr-2" />
            <span className={cn(isMobile ? 'text-[10px]' : 'text-xs')}>Tracks: 1000+</span>
        </div>
        <div className="flex items-center">
            <Users className="h-4 w-4 text-primary mr-2" />
            <span className={cn(isMobile ? 'text-[10px]' : 'text-xs')}>Listeners: 5k</span>
        </div>
        <div className="flex items-center">
            <Calendar className="h-4 w-4 text-primary mr-2" />
            <span className={cn(isMobile ? 'text-[10px]' : 'text-xs')}>Since: 2020</span>
        </div>
        <div className="flex items-center">
            <Star className="h-4 w-4 text-primary mr-2" />
            <span className={cn(isMobile ? 'text-[10px]' : 'text-xs')}>Rating: 4.8</span>
        </div>
    </div>
)

// Expanded content section with station stats
interface ExpandedContentProps {
    station: Station
    existsInNostr: NDKEvent | null
    stationNaddr: string | null
    currentListId?: string
    isMobile: boolean
    isExistsInNostr: boolean
    setIsExpanded: (expanded: boolean) => void
    isExpanded: boolean
    commentsCount: number
    onCommentClick: () => void
    isCurrentlyPlaying: boolean
    handlePlay: () => void
    hasStreams: boolean
}

const ExpandedContent = ({
    station,
    existsInNostr,
    stationNaddr,
    currentListId,
    isMobile,
    isExistsInNostr,
    setIsExpanded,
    isExpanded,
    commentsCount,
    onCommentClick,
    isCurrentlyPlaying,
    handlePlay,
    hasStreams,
}: ExpandedContentProps) => (
    <div className={cn('bg-gray-100', isMobile ? 'p-3' : 'p-4')}>
        <UserProfile pubkey={station.pubkey} compact={false} />

        <div className="mt-4 mb-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <PlayButton
                        isCurrentlyPlaying={isCurrentlyPlaying}
                        handlePlay={handlePlay}
                        hasStreams={hasStreams}
                        isMobile={isMobile}
                        isFullWidth={true}
                    />

                    {isExistsInNostr && station && station.id && (
                        <FavoritesDropdown station={station} currentListId={currentListId} />
                    )}
                </div>

                {existsInNostr && (
                    <div className="flex items-center gap-2">
                        <SocialInteractionBar
                            event={existsInNostr}
                            naddr={stationNaddr || ''}
                            authorPubkey={station.pubkey}
                            commentsCount={commentsCount}
                            onCommentClick={onCommentClick}
                            compact={isMobile}
                        />

                        <Button
                            variant="default"
                            size={isMobile ? 'sm' : 'icon'}
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={cn(isMobile ? 'px-3 py-1 ml-1 h-8' : 'h-9 w-9', 'shrink-0')}
                        >
                            <ChevronUp className={cn(isMobile ? 'h-3 w-3' : 'h-4 w-4')} />
                        </Button>
                    </div>
                )}
            </div>
        </div>

        {/* Mobile-only full width collapse button for better UX */}
        {isMobile && (
            <div className="mt-4 flex justify-center">
                <Button variant="default" size="sm" onClick={() => setIsExpanded(!isExpanded)} className="w-full">
                    {isExpanded ? 'Show Less' : 'Show More'}
                    {isExpanded ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
                </Button>
            </div>
        )}
    </div>
)

interface RadioCardProps {
    station: Station
    currentListId?: string
    naddr?: string
}

export function RadioCard({ station, currentListId, naddr }: RadioCardProps) {
    const isMobile = useMedia('(max-width: 640px)')

    const [isExpanded, setIsExpanded] = useState(false)
    const [commentsCount, setCommentsCount] = useState(0)

    const [existsInNostr, setExistsInNostr] = useState<NDKEvent | null>(null)
    const [checkingNostr, setCheckingNostr] = useState(false)
    const [stationNaddr, setStationNaddr] = useState<string | null>(null)
    const [user, setUser] = useState<NDKUser | null>(null)

    const [selectedStreamId, setSelectedStreamId] = useState<number | undefined>(undefined)

    const isPlaying = useStore(stationsStore, (state) => state.isPlaying)
    const currentStation = useStore(stationsStore, (state) => state.currentStation)
    const isCurrentlyPlaying = currentStation?.id === station.id && isPlaying
    const { isConnected } = useStore(ndkStore)

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
        if (!isConnected) return
        let isMounted = true

        const checkNostr = async () => {
            setCheckingNostr(true)
            try {
                const ndk = ndkActions.getNDK()
                if (!ndk) throw new Error('NDK not initialized')

                if (station.id) {
                    try {
                        const event = await ndk.fetchEvent(station.id)
                        if (!isMounted) return
                        setExistsInNostr(event || null)
                    } catch (error) {
                        console.error('Error fetching event by naddr:', error)
                        setExistsInNostr(null)
                    }
                } else if (station.name) {
                    try {
                        const nostrEvent = await (findStationByNameInNostr as any)(ndk, station.name)
                        if (!isMounted) return

                        if (nostrEvent) {
                            setExistsInNostr(nostrEvent)
                            try {
                                const eventNaddr = (generateStationNaddr as any)(nostrEvent)
                                setStationNaddr(eventNaddr)
                            } catch (error) {
                                console.error('Error generating naddr:', error)
                            }
                        } else {
                            setExistsInNostr(null)
                        }
                    } catch (error) {
                        console.error('Error finding station in Nostr:', error)
                        setExistsInNostr(null)
                    }
                }
            } catch (error) {
                console.error('Error checking Nostr for station:', error)
                setExistsInNostr(null)
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
    }, [station.name, station.id, isConnected, naddr])

    // Get current user
    useEffect(() => {
        const getUser = async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk || !ndk.signer) return

            try {
                const currentUser = await ndk.signer.user()
                setUser(currentUser)
            } catch (error) {
                console.error('Error getting user:', error)
            }
        }

        getUser()
    }, [])

    // Stream handler
    const handleStreamSelect = (stream: Stream) => {
        setSelectedStreamId(stream.quality.bitrate)
    }

    // Play/Pause handler
    const handlePlay = () => {
        if (!station.streams?.length) return

        const selectedStream =
            station.streams.find((s) => s.quality.bitrate === selectedStreamId) ||
            station.streams.find((s) => s.primary) ||
            station.streams[0]

        if (selectedStream) {
            setCurrentStation({
                ...station,
                streams: [selectedStream],
            })

            if (currentStation?.id !== station.id || !isPlaying) {
                togglePlayback()
            }
        }
    }

    // Edit station handler
    const handleEdit = () => {
        openEditStationDrawer(station)
    }

    // Comments visibility handler - now just expands the card
    const toggleComments = () => {
        if (!isExpanded) {
            setIsExpanded(true)
        }
    }

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

    // Determine if card should be rendered as expanded (full width)
    const isFullWidth = isExpanded && existsInNostr !== null && Boolean(existsInNostr)
    const hasStreams = station.streams && Array.isArray(station.streams) && station.streams.length > 0
    const isExistsInNostr = existsInNostr !== null && Boolean(existsInNostr)

    return (
        <Card
            ref={cardRef}
            className={cn(
                'transition-all duration-300 shadow-lg overflow-hidden flex flex-col relative border-3 border-gray-800 p-2',
                isFullWidth ? 'col-span-full w-full' : 'h-full h-[240px]',
            )}
        >
            {isExistsInNostr && (
                <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center z-10">
                    <CheckCircle2 className="w-4 h-4" />
                </div>
            )}
            <div ref={contentRef} className="flex flex-col h-full">
                <div className="flex flex-row justify-between flex-grow">
                    {/* Station image */}
                    <StationImage station={station} isFullWidth={isFullWidth} isMobile={isMobile} />

                    {/* Content section */}
                    <div className="grow min-w-0 flex flex-col h-full">
                        {/* Header with station name, genre and stream selector */}
                        <StationHeader
                            station={station}
                            existsInNostr={existsInNostr}
                            stationNaddr={stationNaddr}
                            checkingNostr={checkingNostr}
                            isMobile={isMobile}
                            isFullWidth={isFullWidth}
                            streams={station.streams}
                            selectedStreamId={selectedStreamId}
                            handleStreamSelect={handleStreamSelect}
                        />

                        {/* Main content with description and tags */}
                        <StationContent
                            station={station}
                            stationTags={stationTags}
                            isMobile={isMobile}
                            isFullWidth={isFullWidth}
                            existsInNostr={existsInNostr}
                            isExpanded={isExpanded}
                            setIsExpanded={setIsExpanded}
                        />

                        {/* Compact footer for non-expanded cards */}
                        {!isFullWidth && (
                            <CardFooter
                                className={cn(
                                    'flex justify-between gap-1 mt-auto',
                                    isMobile ? 'p-2 pt-2 flex-col items-start' : 'p-4 pt-2 pb-2 flex-row-reverse',
                                )}
                            >
                                <div
                                    className={cn(
                                        'flex items-center',
                                        isMobile ? 'w-full justify-between mt-1' : 'space-x-1',
                                    )}
                                >
                                    {isExistsInNostr ? (
                                        <SocialInteractionBar
                                            event={existsInNostr}
                                            authorPubkey={station.pubkey}
                                            commentsCount={commentsCount}
                                            onCommentClick={toggleComments}
                                            compact={true}
                                            naddr={stationNaddr || ''}
                                        />
                                    ) : (
                                        <Button
                                            onClick={handleEdit}
                                            variant="ghost"
                                            size="sm"
                                            className={cn('h-7', isMobile ? 'px-2 text-[10px] w-full' : 'px-1')}
                                        >
                                            <Plus className="h-3 w-3 mr-1" />
                                            <span className={cn(isMobile ? 'text-[10px]' : 'text-xs')}>
                                                Add to Nostr
                                            </span>
                                        </Button>
                                    )}
                                </div>

                                <div
                                    className={cn(
                                        'flex items-center',
                                        isMobile ? 'w-full justify-between mt-1' : 'space-x-2',
                                    )}
                                >
                                    {/* Stream quality selector (mobile only) */}
                                    {isMobile && !isFullWidth && hasStreams && station.streams.length > 1 && (
                                        <div className="shrink-0 w-20">
                                            {station.id && !isNaN(Number(station.id)) && (
                                                <StreamSelector
                                                    stationId={Number(station.id)}
                                                    onStreamSelect={handleStreamSelect}
                                                    selectedStreamId={selectedStreamId}
                                                    streams={station.streams}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* Play button and favorites */}
                                    <div className="flex items-center space-x-1">
                                        <PlayButton
                                            isCurrentlyPlaying={isCurrentlyPlaying}
                                            handlePlay={handlePlay}
                                            hasStreams={hasStreams}
                                            isMobile={isMobile}
                                            isFullWidth={false}
                                        />

                                        {isExistsInNostr && station && station.id && (
                                            <FavoritesDropdown station={station} currentListId={currentListId} />
                                        )}
                                    </div>

                                    {/* Expand button (mobile only) */}
                                    {isMobile && isExistsInNostr && (
                                        <ExpandButton
                                            isExpanded={isExpanded}
                                            setIsExpanded={setIsExpanded}
                                            isMobile={isMobile}
                                            isFullWidth={false}
                                        />
                                    )}
                                </div>
                            </CardFooter>
                        )}
                    </div>
                </div>

                {/* Expanded content section */}
                {isExpanded && isExistsInNostr && (
                    <>
                        <ExpandedContent
                            station={station}
                            existsInNostr={existsInNostr}
                            stationNaddr={stationNaddr}
                            currentListId={currentListId}
                            isMobile={isMobile}
                            isExistsInNostr={isExistsInNostr}
                            setIsExpanded={setIsExpanded}
                            isExpanded={isExpanded}
                            commentsCount={commentsCount}
                            onCommentClick={toggleComments}
                            isCurrentlyPlaying={isCurrentlyPlaying}
                            handlePlay={handlePlay}
                            hasStreams={hasStreams}
                        />

                        {/* Comments section - Always visible when expanded */}
                        <div ref={commentsRef} className={cn('bg-gray-50 border-t', isMobile ? 'p-3' : 'p-4')}>
                            {station.id ? (
                                <CommentsList
                                    stationId={station.id}
                                    stationEvent={existsInNostr}
                                    commentsCount={commentsCount}
                                />
                            ) : (
                                <div className="text-center py-4 text-muted-foreground">
                                    Cannot load comments for this station.
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Card>
    )
}
