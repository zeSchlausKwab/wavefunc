import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { FavoritesList } from '@wavefunc/common'
import {
    Calendar,
    ChevronDown,
    ChevronUp,
    Heart,
    MessageCircle,
    Music,
    Pencil,
    Play,
    Share2,
    Star,
    Users,
    Zap,
} from 'lucide-react'
import React from 'react'

import { setCurrentStation, stationsStore, togglePlayback } from '@/lib/store/stations'
import { openEditStationDrawer } from '@/lib/store/ui'
import type { Station } from '@wavefunc/common/types/station'
import type { Stream } from '@wavefunc/common/types/stream'
import { NDKUser } from '@nostr-dev-kit/ndk'
import { useStore } from '@tanstack/react-store'
import { StreamSelector } from '../radio/StreamSelector'
import { FavoritesDropdown } from './FavoritesDropdown'
import CommentsList from '@/components/comments'
import { useMedia } from 'react-use'
import { cn } from '@/lib/utils'
import { ndkActions } from '@/lib/store/ndk'

interface ExpandableStationCardProps {
    station: Station
    onUpdate?: (updatedStation: Station) => void
    onDelete?: (stationId: string) => void
    currentListId?: string
    favoritesLists?: FavoritesList[]
}

export function ExpandableStationCard({ station, currentListId, favoritesLists = [] }: ExpandableStationCardProps) {
    const [isExpanded, setIsExpanded] = React.useState(false)
    const [showComments, setShowComments] = React.useState(false)
    const [commentsCount, setCommentsCount] = React.useState(0)
    const [user, setUser] = React.useState<NDKUser | null>(null)
    const isPlaying = useStore(stationsStore, (state) => state.isPlaying)
    const isMobile = useMedia('(max-width: 640px)')

    React.useEffect(() => {
        const getUser = async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) {
                throw new Error('NDK not initialized')
            }
            const user = await ndk.signer?.user()
            if (user) {
                setUser(user)
            }
        }
        getUser()
    }, [station.pubkey])

    const [selectedStreamId, setSelectedStreamId] = React.useState<number | undefined>(undefined)

    const handleStreamSelect = (stream: Stream) => {
        setSelectedStreamId(stream.quality.bitrate)
    }

    const handlePlay = () => {
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

            if (!isPlaying) {
                togglePlayback()
            }

            console.log('Playing station:', station.name, 'with stream:', selectedStream.url)
        }
    }

    const handleEdit = () => {
        openEditStationDrawer(station)
    }

    const toggleComments = () => {
        setShowComments(!showComments)
        if (!showComments && !isExpanded) {
            setIsExpanded(true)
        }
    }

    // Helper component to render Lucide icons with proper typing
    const IconWrapper = ({ icon: Icon, className = 'h-5 w-5' }: { icon: any; className?: string }) => {
        return <Icon className={className} />
    }

    // Extract tags from station, filtering out non-tag entries
    const stationTags = station.tags
        .filter((tag) => tag[0] !== 'd' && tag[0] !== 'genre' && tag[0] !== 'thumbnail')
        .map((tag) => tag[1] || tag[0])
        .filter(Boolean)

    return (
        <Card className={cn('w-full bg-white bg-opacity-90 shadow-lg overflow-hidden', isMobile && 'text-sm')}>
            <div className="flex flex-col">
                <div className="flex flex-col md:flex-row">
                    <div
                        className={cn(
                            'relative transition-all duration-300',
                            isExpanded
                                ? isMobile
                                    ? 'w-full h-36'
                                    : 'w-full md:w-64 h-64'
                                : isMobile
                                  ? 'w-full h-24'
                                  : 'w-full md:w-48 h-48',
                        )}
                    >
                        <img
                            src={station.imageUrl || '/placeholder-station.png'}
                            alt={station.name || 'Station'}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <div className="grow">
                        <CardHeader className={cn(isMobile && 'p-3')}>
                            <div className="flex items-center justify-between">
                                <div className="min-w-0 flex-1">
                                    <CardTitle
                                        className={cn(
                                            'text-primary font-press-start-2p truncate',
                                            isMobile ? 'text-xs' : 'text-sm',
                                        )}
                                    >
                                        {station.name}
                                    </CardTitle>
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
                                    {station.streams.length > 1 && (
                                        <div className={cn('shrink-0', isMobile ? 'w-16' : '')}>
                                            <StreamSelector
                                                stationId={Number(station.id)}
                                                onStreamSelect={handleStreamSelect}
                                                selectedStreamId={selectedStreamId}
                                                streams={station.streams}
                                            />
                                        </div>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size={isMobile ? 'sm' : 'icon'}
                                        onClick={handlePlay}
                                        className="shrink-0"
                                    >
                                        <IconWrapper icon={Play} className="h-4 w-4 text-primary" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size={isMobile ? 'sm' : 'icon'}
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="shrink-0"
                                    >
                                        {isExpanded ? (
                                            <IconWrapper icon={ChevronUp} className="h-4 w-4 text-primary" />
                                        ) : (
                                            <IconWrapper icon={ChevronDown} className="h-4 w-4 text-primary" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className={cn(isMobile && 'p-3 pt-0')}>
                            <p className={cn('font-press-start-2p line-clamp-2', isMobile ? 'text-[10px]' : 'text-xs')}>
                                {station.description}
                            </p>

                            {/* Tag pills */}
                            {stationTags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1 overflow-hidden h-6">
                                    {stationTags.slice(0, isMobile ? 3 : 5).map((tag, index) => (
                                        <span
                                            key={index}
                                            className={cn(
                                                'inline-block text-xs bg-primary/10 text-primary rounded-full whitespace-nowrap overflow-hidden text-ellipsis',
                                                isMobile ? 'px-2 py-0.5 text-[8px] max-w-16' : 'px-2 py-1 max-w-24',
                                            )}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                    {stationTags.length > (isMobile ? 3 : 5) && (
                                        <span
                                            className={cn(
                                                'inline-block bg-gray-100 text-gray-500 rounded-full',
                                                isMobile ? 'px-2 py-0.5 text-[8px]' : 'px-2 py-1 text-xs',
                                            )}
                                        >
                                            +{stationTags.length - (isMobile ? 3 : 5)}
                                        </span>
                                    )}
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className={cn('flex justify-between', isMobile && 'p-3')}>
                            <div className="flex space-x-1">
                                <Button
                                    variant="ghost"
                                    size={isMobile ? 'sm' : 'icon'}
                                    aria-label="Flash"
                                    className="h-8 w-8"
                                >
                                    <IconWrapper icon={Zap} className="h-4 w-4 text-primary" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size={isMobile ? 'sm' : 'icon'}
                                    aria-label="Heart"
                                    className="h-8 w-8"
                                >
                                    <IconWrapper icon={Heart} className="h-4 w-4 text-primary" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size={isMobile ? 'sm' : 'icon'}
                                    aria-label="Comment"
                                    onClick={toggleComments}
                                    className="h-8 w-8"
                                >
                                    <IconWrapper icon={MessageCircle} className="h-4 w-4 text-primary" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size={isMobile ? 'sm' : 'icon'}
                                    aria-label="Share"
                                    className="h-8 w-8"
                                >
                                    <IconWrapper icon={Share2} className="h-4 w-4 text-primary" />
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
                                    <IconWrapper icon={Pencil} className="h-3 w-3 mr-1" />
                                    Edit
                                </Button>
                            )}
                        </CardFooter>
                    </div>
                </div>
                {isExpanded && (
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
                            {Array.isArray(favoritesLists) && (
                                <FavoritesDropdown
                                    station={station}
                                    currentListId={currentListId}
                                    favoritesLists={favoritesLists}
                                />
                            )}
                        </div>
                        <div className={cn('grid gap-2 mb-3', isMobile ? 'grid-cols-1' : 'grid-cols-2 gap-4')}>
                            <div className="flex items-center">
                                <IconWrapper icon={Music} className="h-4 w-4 text-primary mr-2" />
                                <span className={cn('font-press-start-2p', isMobile ? 'text-[10px]' : 'text-xs')}>
                                    Tracks: 1000+
                                </span>
                            </div>
                            <div className="flex items-center">
                                <IconWrapper icon={Users} className="h-4 w-4 text-primary mr-2" />
                                <span className={cn('font-press-start-2p', isMobile ? 'text-[10px]' : 'text-xs')}>
                                    Listeners: 5k
                                </span>
                            </div>
                            <div className="flex items-center">
                                <IconWrapper icon={Calendar} className="h-4 w-4 text-primary mr-2" />
                                <span className={cn('font-press-start-2p', isMobile ? 'text-[10px]' : 'text-xs')}>
                                    Since: 2020
                                </span>
                            </div>
                            <div className="flex items-center">
                                <IconWrapper icon={Star} className="h-4 w-4 text-primary mr-2" />
                                <span className={cn('font-press-start-2p', isMobile ? 'text-[10px]' : 'text-xs')}>
                                    Rating: 4.8
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {showComments && (
                    <div className={cn('bg-gray-50 border-t', isMobile ? 'p-3' : 'p-4')}>
                        <CommentsList stationId={station.id} stationEvent={station} commentsCount={commentsCount} />
                    </div>
                )}
            </div>
        </Card>
    )
}
