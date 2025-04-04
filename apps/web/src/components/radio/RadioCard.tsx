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
import { NDKEvent, NDKKind, NDKUser } from '@nostr-dev-kit/ndk'
import type { Station } from '@wavefunc/common'
import { decodeStationNaddr, findStationByNameInNostr, generateStationNaddr, RADIO_EVENT_KINDS } from '@wavefunc/common'
import type { Stream } from '@wavefunc/common/types/stream'
import NDK from '@nostr-dev-kit/ndk'
import { nip19 } from 'nostr-tools'

// Define sub-components to break down the complexity
// Station image with play controls
interface StationImageProps {
    station: Station
    isFullWidth: boolean
    isCurrentlyPlaying: boolean
    existsInNostr: unknown
    handlePlay: () => void
    handleEdit: () => void
    isMobile: boolean
}

const StationImage = ({
    station,
    isFullWidth,
    isCurrentlyPlaying,
    existsInNostr,
    handlePlay,
    handleEdit,
    isMobile,
}: StationImageProps) => (
    <div
        className={cn(
            'relative shrink-0',
            isFullWidth ? (isMobile ? 'w-32 h-32' : 'w-64 h-64') : isMobile ? 'w-24 h-24' : 'w-32 h-32 m-2',
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
                    disabled={!station.streams || !Array.isArray(station.streams) || station.streams.length === 0}
                >
                    {isCurrentlyPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </Button>
                {!existsInNostr && (
                    <Button size="icon" variant="secondary" className="rounded-full w-7 h-7" onClick={handleEdit}>
                        <Plus className="w-3 h-3" />
                    </Button>
                )}
            </div>
        )}
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
        <div className="mt-2 flex flex-wrap gap-1 overflow-hidden h-6">
            {tags.slice(0, isMobile ? 2 : 3).map((tag: string, index: number) => (
                <span
                    key={index}
                    className={cn(
                        'inline-block bg-primary/10 text-primary rounded-full whitespace-nowrap overflow-hidden text-ellipsis',
                        isMobile ? 'px-2 py-0.5 text-[8px] max-w-16' : 'px-2 py-0.5 text-xs max-w-24',
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

interface RadioCardProps {
    station: Station
    currentListId?: string
    naddr?: string
}

export function RadioCard({ station, currentListId, naddr }: RadioCardProps) {
    const isMobile = useMedia('(max-width: 640px)')

    const [isExpanded, setIsExpanded] = useState(false)
    const [showComments, setShowComments] = useState(false)
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

    // Check if station exists in Nostr - Updated to use naddr if available
    useEffect(() => {
        // Exit early if not connected
        if (!isConnected) return

        // Flag to handle component unmount
        let isMounted = true

        const checkNostr = async () => {
            setCheckingNostr(true)

            try {
                const ndk = ndkActions.getNDK()
                if (!ndk) throw new Error('NDK not initialized')

                // If naddr is provided, fetch the event directly
                if (station.id) {
                    try {
                        const event = await ndk.fetchEvent(station.id)
                        if (!isMounted) return

                        if (event) {
                            setExistsInNostr(event)
                        } else {
                            setExistsInNostr(null)
                        }
                    } catch (error) {
                        console.error('Error fetching event by naddr:', error)
                        setExistsInNostr(null)
                    }
                }
                // Otherwise, search for the station by name
                else if (station.name) {
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

        // Run the check
        checkNostr()

        // Cleanup function
        return () => {
            isMounted = false
        }
    }, [station.name, isConnected, naddr])

    // Get current user - simplified
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

    // Play/Pause handler - simplified
    const handlePlay = () => {
        if (!station.streams?.length) return

        // Find the appropriate stream
        const selectedStream =
            station.streams.find((s) => s.quality.bitrate === selectedStreamId) ||
            station.streams.find((s) => s.primary) ||
            station.streams[0]

        if (selectedStream) {
            // Set the station to play
            setCurrentStation({
                ...station,
                streams: [selectedStream],
            })

            // If not currently playing this station, toggle playback
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
    const isFullWidth = isExpanded && existsInNostr !== null && Boolean(existsInNostr)

    const isExistsInNostr =
        existsInNostr !== null && Boolean(existsInNostr) !== false && typeof existsInNostr !== 'boolean'

    return (
        <Card
            ref={cardRef}
            className={cn(
                'transition-all duration-300 bg-white bg-opacity-90 shadow-lg overflow-hidden flex flex-col',
                existsInNostr ? 'border-green-500 border-2' : '',
                isFullWidth ? 'col-span-full w-full' : 'h-full h-[240px]',
            )}
        >
            <div ref={contentRef} className="flex flex-col h-full">
                {naddr}
                <div
                    className={cn(
                        'flex h-full',
                        isMobile ? 'flex-row' : isFullWidth ? 'flex-row' : 'flex-row items-start',
                    )}
                >
                    {/* Station image section */}
                    <StationImage
                        station={station}
                        isFullWidth={isFullWidth}
                        isCurrentlyPlaying={isCurrentlyPlaying}
                        existsInNostr={existsInNostr}
                        handlePlay={handlePlay}
                        handleEdit={handleEdit}
                        isMobile={isMobile}
                    />

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

                            {/* Tag pills - using the StationTags component */}
                            <StationTags tags={stationTags} isMobile={isMobile} />

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
                                <div className="flex items-center space-x-1">
                                    {existsInNostr ? (
                                        <SocialInteractionBar
                                            event={existsInNostr}
                                            authorPubkey={station.pubkey}
                                            commentsCount={commentsCount}
                                            onCommentClick={toggleComments}
                                            compact={true}
                                            naddr={stationNaddr || ''}
                                        />
                                    ) : (
                                        <Button onClick={handleEdit} variant="ghost" size="sm" className="h-7 px-1">
                                            <Plus className="h-3 w-3 mr-1" />
                                            <span className="text-xs">Add to Nostr</span>
                                        </Button>
                                    )}
                                </div>

                                <div className="flex items-center space-x-2">
                                    {existsInNostr && station && station.id && (
                                        <FavoritesDropdown station={station} currentListId={currentListId} />
                                    )}
                                </div>
                            </CardFooter>
                        )}

                        {/* Full footer only for expanded cards */}
                        {isFullWidth && (
                            <CardFooter className={cn('flex flex-row-reverse justify-between', isMobile && 'p-3')}>
                                <div className="flex items-center space-x-1">
                                    {existsInNostr ? (
                                        <SocialInteractionBar
                                            event={existsInNostr}
                                            naddr={stationNaddr || ''}
                                            authorPubkey={station.pubkey}
                                            commentsCount={commentsCount}
                                            onCommentClick={toggleComments}
                                        />
                                    ) : (
                                        <Button onClick={handleEdit} variant="ghost" size="icon" className="h-8 w-8">
                                            <Plus className="h-4 w-4 text-primary" />
                                        </Button>
                                    )}
                                </div>
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
                )}
            </div>
        </Card>
    )
}
