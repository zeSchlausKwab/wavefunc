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
import { CheckCircle2, ChevronDown, ChevronUp, Edit } from 'lucide-react'

// Stores and utilities
import type { Station } from '@wavefunc/common'
import {
    cn,
    getStationBackgroundColor,
    ndkActions,
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
    isExpanded: boolean
    setIsExpanded: (expanded: boolean) => void
}

const StationContent = ({
    station,
    stationTags,
    isMobile,
    isFullWidth,
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
                {station.event && (
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
    stationNaddr: string
    currentListId?: string
    isMobile: boolean
    setIsExpanded: (expanded: boolean) => void
    isExpanded: boolean
    commentsCount: number
    onCommentClick: () => void
    isAuthor: boolean
    handleEdit: () => void
    selectedStreamId?: number
    handleStreamSelect: (stream: Stream) => void
    hasStreams: boolean
}

const ExpandedContent = ({
    station,
    stationNaddr,
    currentListId,
    isMobile,
    setIsExpanded,
    isExpanded,
    commentsCount,
    onCommentClick,
    isAuthor,
    handleEdit,
    selectedStreamId,
    handleStreamSelect,
    hasStreams,
}: ExpandedContentProps) => (
    <div className={cn('bg-gray-100', isMobile ? 'p-3' : 'p-4')}>
        <UserProfile pubkey={station.pubkey} compact={false} />

        {/* Stream quality selector when expanded and multiple streams are available */}
        {hasStreams && station.streams && station.streams.length > 1 && (
            <div className="mt-4 p-2 bg-white rounded-md border">
                <div className="flex flex-row items-center justify-between">
                    <div className="font-medium text-sm">Stream Quality:</div>
                    <div className="flex items-center gap-2">
                        {station.id && (
                            <StreamSelector
                                stationId={Number(station.id)}
                                onStreamSelect={handleStreamSelect}
                                selectedStreamId={selectedStreamId}
                                streams={station.streams}
                            />
                        )}
                    </div>
                </div>
                {/* Show detailed info about selected stream */}
            </div>
        )}

        <div className="mt-4 mb-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
                {station && station.id && (
                    <div className="flex items-center space-x-2">
                        <FavoritesDropdown station={station} currentListId={currentListId} />
                        {isAuthor && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleEdit}
                                className="h-8"
                                title="Edit Station"
                            >
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                            </Button>
                        )}
                    </div>
                )}

                {station.event && (
                    <div className="flex items-center gap-2">
                        <SocialInteractionBar
                            event={station.event}
                            naddr={stationNaddr}
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
}

export default function RadioCard({ station, currentListId }: RadioCardProps) {
    const isMobile = useMedia('(max-width: 640px)')

    const [isExpanded, setIsExpanded] = useState(false)
    const [commentsCount, setCommentsCount] = useState(0)
    const [isAuthor, setIsAuthor] = useState(false)

    // Initialize selectedStreamId with the primary stream or first stream
    const initialStreamId = useMemo(() => {
        if (!station.streams || !Array.isArray(station.streams) || station.streams.length === 0) {
            return undefined
        }

        // Try to find the primary stream first
        const primaryStream = station.streams.find((stream) => stream.primary === true)
        if (primaryStream?.quality?.bitrate) {
            return primaryStream.quality.bitrate
        }

        // Fall back to the first stream
        return station.streams[0]?.quality?.bitrate
    }, [station.streams])

    const [selectedStreamId, setSelectedStreamId] = useState<number | undefined>(initialStreamId)

    const isPlaying = useStore(stationsStore, (state) => state.isPlaying)
    const currentStation = useStore(stationsStore, (state) => state.currentStation)
    const isCurrentlyPlaying = currentStation?.id === station.id && isPlaying

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

    // Get current user and check if user is author
    useEffect(() => {
        const getUser = async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk || !ndk.signer) return

            try {
                const currentUser = await ndk.signer.user()
                if (currentUser && station.pubkey) {
                    setIsAuthor(currentUser.pubkey === station.pubkey)
                }
            } catch (error) {
                console.error('Error getting user:', error)
            }
        }

        getUser()
    }, [station.pubkey])

    // Stream handler
    const handleStreamSelect = (stream: Stream) => {
        if (stream && stream.quality && stream.quality.bitrate) {
            setSelectedStreamId(stream.quality.bitrate)
        }
    }

    // Play/Pause handler
    const handlePlay = () => {
        if (!station.streams?.length) {
            return
        }

        try {
            // Find the selected stream by bitrate
            const selectedStream =
                station.streams.find((s) => s.quality?.bitrate === selectedStreamId) ||
                station.streams.find((s) => s.primary === true) ||
                station.streams[0]

            if (selectedStream) {
                // If this is the current station, just toggle playback
                if (currentStation?.id === station.id) {
                    togglePlayback()
                } else {
                    // If this is a new station, set it as current and ensure playback starts
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
    const isFullWidth = isExpanded && station.event !== undefined
    const hasStreams = station.streams && Array.isArray(station.streams) && station.streams.length > 0
    const hasNostrEvent = Boolean(station.event)

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

            {hasNostrEvent && (
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
                            existsInNostr={station.event || null}
                            stationNaddr={station.naddr || ''}
                            checkingNostr={false}
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
                                    {hasNostrEvent ? (
                                        <SocialInteractionBar
                                            event={station.event!}
                                            authorPubkey={station.pubkey}
                                            commentsCount={commentsCount}
                                            onCommentClick={toggleComments}
                                            compact={true}
                                            naddr={station.naddr || ''}
                                        />
                                    ) : null}
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

                                    {hasNostrEvent && station && station.id && (
                                        <FavoritesDropdown station={station} currentListId={currentListId} />
                                    )}

                                    {/* Expand button (mobile only) */}
                                    {isMobile && hasNostrEvent && (
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
                {isExpanded && hasNostrEvent && (
                    <>
                        <ExpandedContent
                            station={station}
                            stationNaddr={station.naddr || ''}
                            currentListId={currentListId}
                            isMobile={isMobile}
                            setIsExpanded={setIsExpanded}
                            isExpanded={isExpanded}
                            commentsCount={commentsCount}
                            onCommentClick={toggleComments}
                            isAuthor={isAuthor}
                            handleEdit={handleEdit}
                            selectedStreamId={selectedStreamId}
                            handleStreamSelect={handleStreamSelect}
                            hasStreams={hasStreams}
                        />

                        {/* Comments section - Always visible when expanded */}
                        <div ref={commentsRef} className={cn('bg-gray-50 border-t', isMobile ? 'p-3' : 'p-4')}>
                            {station.id && station.event ? (
                                <CommentsList
                                    stationId={station.id}
                                    stationEvent={station.event}
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
