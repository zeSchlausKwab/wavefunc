import { useAutoAnimate } from '@formkit/auto-animate/react'
import { useStore } from '@tanstack/react-store'
import { useEffect, useMemo, useState } from 'react'
import { useMedia } from 'react-use'

// UI Components
import { Button } from '@wavefunc/ui/components/ui/button'
import { Card, CardContent, CardFooter } from '@wavefunc/ui/components/ui/card'
import { SocialInteractionBar } from '../social/SocialInteractionBar'
import { FavoritesDropdown } from '../station/FavoritesDropdown'
import { StreamSelector } from './StreamSelector'

// Icons
import { CheckCircle2, ChevronDown, ChevronUp, Plus } from 'lucide-react'

// Stores and utilities
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk'
import type { Station } from '@wavefunc/common'
import {
    cn,
    decodeStationNaddr,
    getStationBackgroundColor,
    ndkActions,
    ndkStore,
    openEditStationDrawer,
    playStation,
    stationsStore,
    togglePlayback,
} from '@wavefunc/common'
import type { Stream } from '@wavefunc/common/src/types/stream'
import CommentsList from '../comments/CommentsList'
import { UserProfile } from '../UserProfile'
import { ExpandButton } from './station-card/ExplandButton'
import { PlayButton } from './station-card/PlayButton'
import { StationHeader } from './station-card/StationHeader'
import { StationImage } from './station-card/StationImage'
import { StationTags } from './station-card/StationTags'

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
}: ExpandedContentProps) => (
    <div className={cn('bg-gray-100', isMobile ? 'p-3' : 'p-4')}>
        <UserProfile pubkey={station.pubkey} compact={false} />

        <div className="mt-4 mb-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
                {isExistsInNostr && station && station.id && (
                    <FavoritesDropdown station={station} currentListId={currentListId} />
                )}

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

                        {!isMobile && (
                            <Button
                                variant="default"
                                size={isMobile ? 'sm' : 'icon'}
                                onClick={() => setIsExpanded(!isExpanded)}
                                className={cn(isMobile ? 'px-3 py-1 ml-1 h-8' : 'h-9 w-9', 'shrink-0')}
                            >
                                <ChevronUp className={cn(isMobile ? 'h-3 w-3' : 'h-4 w-4')} />
                            </Button>
                        )}
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

export default function RadioCard({ station, currentListId, naddr }: RadioCardProps) {
    const isMobile = useMedia('(max-width: 640px)')

    const [isExpanded, setIsExpanded] = useState(false)
    // @ts-ignore
    const [commentsCount, setCommentsCount] = useState(0)

    const [existsInNostr, setExistsInNostr] = useState<NDKEvent | null>(null)
    const [checkingNostr, setCheckingNostr] = useState(false)
    const [stationNaddr, setStationNaddr] = useState<string | null>(null)
    // @ts-ignore
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

    // Generate background color based on station name
    const cardBackgroundColor = useMemo(() => getStationBackgroundColor(station.name || '', 0.9), [station.name])

    // Check if station exists in Nostr
    useEffect(() => {
        let isMounted = true

        const checkRadioExists = async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk || !station.naddr || !isMounted) return

            try {
                setStationNaddr(station.naddr) // Store the naddr directly, it's already properly encoded

                // Decode it to get necessary data for fetching the event
                const decodedData = decodeStationNaddr(station.naddr)

                // Create a filter to find the exact event
                const filter = {
                    kinds: [decodedData.kind],
                    authors: [decodedData.pubkey],
                    '#d': [decodedData.identifier],
                }

                const events = await ndk.fetchEvents(filter)
                if (!isMounted) return

                const foundEvent = Array.from(events)[0]
                if (foundEvent) {
                    setExistsInNostr(foundEvent)
                    return
                }

                // No event found, set to null
                setExistsInNostr(null)
            } catch (e) {
                console.error('Error checking if radio exists:', e)
            }
        }

        checkRadioExists()

        return () => {
            isMounted = false
        }
    }, [station.naddr, ndkActions])

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
        console.log('handlePlay', station.name, station.streams)
        if (!station.streams?.length) {
            console.log('No streams available for this station')
            return
        }

        try {
            const selectedStream =
                station.streams.find((s) => s.quality.bitrate === selectedStreamId) ||
                station.streams.find((s) => s.primary) ||
                station.streams[0]

            console.log('Selected stream:', selectedStream)

            if (selectedStream) {
                // If this is the current station, just toggle playback
                if (currentStation?.id === station.id) {
                    console.log('Toggling playback for current station')
                    togglePlayback()
                } else {
                    // If this is a new station, set it as current and ensure playback starts
                    console.log('Playing new station')
                    playStation({
                        ...station,
                        streams: [selectedStream],
                    })
                }
            }
        } catch (error) {
            console.error('Error in handlePlay:', error)
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
            .filter((tag) => tag[0] === 't') // Only keep 't' tags which are actual content/genre tags
            .map((tag) => tag[1])
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
                'transition-all duration-300 overflow-hidden flex flex-col relative p-2',
                isFullWidth ? 'col-span-full w-full' : 'h-full h-[200px]',
            )}
            style={{ backgroundColor: cardBackgroundColor }}
        >
            <PlayButton
                className="absolute top-2 right-2 z-30"
                isCurrentlyPlaying={isCurrentlyPlaying}
                handlePlay={handlePlay}
                hasStreams={hasStreams}
                isMobile={isMobile}
                isFullWidth={isFullWidth}
            />
            {isExistsInNostr && (
                <div className="absolute bottom-2 left-2 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center z-10">
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

                                    {isExistsInNostr && station && station.id && (
                                        <FavoritesDropdown station={station} currentListId={currentListId} />
                                    )}

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
