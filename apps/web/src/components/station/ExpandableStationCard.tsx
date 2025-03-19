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

import { nostrService } from '@/lib/services/ndk'
import { setCurrentStation, stationsStore, togglePlayback } from '@/lib/store/stations'
import { openEditStationDrawer } from '@/lib/store/ui'
import type { Station } from '@wavefunc/common/types/station'
import type { Stream } from '@wavefunc/common/types/stream'
import { NDKUser } from '@nostr-dev-kit/ndk'
import { useStore } from '@tanstack/react-store'
import { StreamSelector } from '../radio/StreamSelector'
import { FavoritesDropdown } from './FavoritesDropdown'
import CommentsList from '@/components/comments'

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

    React.useEffect(() => {
        const getUser = async () => {
            const user = await nostrService.getNDK().signer?.user()
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

    return (
        <Card className="w-full bg-white bg-opacity-90 shadow-lg overflow-hidden">
            <div className="flex flex-col">
                <div className="flex flex-col md:flex-row">
                    <div
                        className={`relative ${isExpanded ? 'w-full md:w-64 h-64' : 'w-full md:w-48 h-48'} transition-all duration-300`}
                    >
                        <img
                            src={station.imageUrl || '/placeholder-station.png'}
                            alt={station.name || 'Station'}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <div className="grow">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-primary text-sm font-press-start-2p">
                                        {station.name}
                                    </CardTitle>
                                    <CardDescription className="text-xs font-press-start-2p mt-1">
                                        {station.genre}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {station.streams.length > 1 && (
                                        <StreamSelector
                                            stationId={Number(station.id)}
                                            onStreamSelect={handleStreamSelect}
                                            selectedStreamId={selectedStreamId}
                                            streams={station.streams}
                                        />
                                    )}
                                    <Button variant="ghost" size="icon" onClick={handlePlay}>
                                        <Play className="h-4 w-4 text-primary" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)}>
                                        {isExpanded ? (
                                            <ChevronUp className="h-4 w-4 text-primary" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4 text-primary" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs font-press-start-2p">{station.description}</p>
                        </CardContent>
                        <CardFooter className="flex justify-between">
                            <div className="flex space-x-2">
                                <Button variant="ghost" size="icon" aria-label="Flash">
                                    <Zap className="h-4 w-4 text-primary" />
                                </Button>
                                <Button variant="ghost" size="icon" aria-label="Flash">
                                    <Heart className="h-4 w-4 text-primary" />
                                </Button>
                                <Button variant="ghost" size="icon" aria-label="Comment" onClick={toggleComments}>
                                    <MessageCircle className="h-4 w-4 text-primary" />
                                </Button>
                                <Button variant="ghost" size="icon" aria-label="Share">
                                    <Share2 className="h-4 w-4 text-primary" />
                                </Button>
                            </div>
                            {station.pubkey === user?.pubkey && (
                                <Button
                                    onClick={handleEdit}
                                    className="bg-secondary hover:bg-secondary-foreground text-primary hover:text-white font-press-start-2p text-xs"
                                    size="sm"
                                >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                </Button>
                            )}
                        </CardFooter>
                    </div>
                </div>
                {isExpanded && (
                    <div className="bg-gray-100 p-4">
                        <div className="flex items-center mb-4">
                            <div className="w-10 h-10 rounded-full bg-primary mr-3"></div>
                            <div>
                                <p className="text-sm font-semibold font-press-start-2p">
                                    {user?.profile?.name || 'Anonymous'}
                                </p>
                                <p className="text-xs text-gray-500 font-press-start-2p">Station Creator</p>
                            </div>
                        </div>
                        <div className="mb-4">
                            {Array.isArray(favoritesLists) && (
                                <FavoritesDropdown
                                    station={station}
                                    currentListId={currentListId}
                                    favoritesLists={favoritesLists}
                                />
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="flex items-center">
                                <Music className="h-4 w-4 text-primary mr-2" />
                                <span className="text-xs font-press-start-2p">Tracks: 1000+</span>
                            </div>
                            <div className="flex items-center">
                                <Users className="h-4 w-4 text-primary mr-2" />
                                <span className="text-xs font-press-start-2p">Listeners: 5k</span>
                            </div>
                            <div className="flex items-center">
                                <Calendar className="h-4 w-4 text-primary mr-2" />
                                <span className="text-xs font-press-start-2p">Since: 2020</span>
                            </div>
                            <div className="flex items-center">
                                <Star className="h-4 w-4 text-primary mr-2" />
                                <span className="text-xs font-press-start-2p">Rating: 4.8</span>
                            </div>
                        </div>
                    </div>
                )}

                {showComments && (
                    <div className="bg-gray-50 p-4 border-t">
                        <CommentsList stationId={station.id} stationEvent={station} commentsCount={commentsCount} />
                    </div>
                )}
            </div>
        </Card>
    )
}
