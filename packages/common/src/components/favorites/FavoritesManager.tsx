import { Button } from '@wavefunc/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { ndkActions, ndkStore, RADIO_EVENT_KINDS } from '@wavefunc/common'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useStore } from '@tanstack/react-store'
import type { Station } from '@wavefunc/common'
import {
    type FavoritesList,
    fetchFavoritesLists,
    subscribeToFavoritesLists,
    parseRadioEventWithSchema,
} from '@wavefunc/common'
import { Edit, Heart, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EditFavoritesListDrawer } from './EditFavoritesListDrawer'
import RadioCard from '../radio/RadioCard'

interface ResolvedStation {
    id: string
    station: Station | null
    favorite: {
        event_id: string
        name: string
        added_at: number
        naddr?: string
        relay_url?: string
    }
}

export function FavoritesManager() {
    const [favoritesLists, setFavoritesLists] = useState<FavoritesList[]>([])
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    const [selectedFavoritesList, setSelectedFavoritesList] = useState<FavoritesList | undefined>()
    const [isLoading, setIsLoading] = useState(false)
    const [resolvedStations, setResolvedStations] = useState<Record<string, ResolvedStation>>({})
    const { ndk } = useStore(ndkStore)

    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) {
            console.error('NDK not initialized')
            return
        }
        const pubkey = ndk?.activeUser?.pubkey

        if (!pubkey) {
            setFavoritesLists([])
            setResolvedStations({})
            return
        }

        setIsLoading(true)

        // Fetch all favorites lists for the user
        fetchFavoritesLists(ndk, { pubkey })
            .then((lists) => {
                setFavoritesLists(lists)
            })
            .catch((error) => {
                console.error('Error fetching favorites lists:', error)
            })
            .finally(() => {
                setIsLoading(false)
            })

        // Subscribe to updates to favorites lists
        const subscription = subscribeToFavoritesLists(ndk, { pubkey }, (favoritesList) => {
            setFavoritesLists((prev) => {
                const index = prev.findIndex((list) => list.id === favoritesList.id)
                if (index >= 0) {
                    const newLists = [...prev]
                    newLists[index] = favoritesList
                    return newLists
                }
                return [...prev, favoritesList]
            })
        })

        return () => {
            subscription?.stop()
            setFavoritesLists([])
            setResolvedStations({})
        }
    }, [ndk?.activeUser?.pubkey]) // Depend on pubkey changes

    // Effect to resolve stations when favorites lists change
    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) {
            console.error('NDK not initialized')
            return
        }
        if (!ndk?.activeUser?.pubkey || favoritesLists.length === 0) {
            return
        }

        const resolveStations = async () => {
            const newResolvedStations: Record<string, ResolvedStation> = {}

            for (const list of favoritesLists) {
                if (!list.favorites || list.favorites.length === 0) {
                    continue
                }

                for (const favorite of list.favorites) {
                    // Skip invalid favorites
                    if (!favorite.event_id) {
                        console.warn('Skipping invalid favorite:', favorite)
                        continue
                    }

                    // Skip already resolved stations
                    if (newResolvedStations[favorite.event_id]) continue

                    try {
                        let event: NDKEvent | null = null

                        // Try to fetch from the specific relay if provided
                        if (favorite.relay_url) {
                            try {
                                console.log(`Trying to fetch from specified relay: ${favorite.relay_url}`)
                                // TODO: Use relay hint when NDK supports it
                            } catch (error) {
                                console.warn(`Failed to fetch from relay ${favorite.relay_url}:`, error)
                            }
                        }

                        if (favorite.naddr) {
                            try {
                                const parts = favorite.naddr.split(':')
                                if (parts.length >= 3 && parts[0] === String(RADIO_EVENT_KINDS.STREAM)) {
                                    const [kind, pubkey, identifier] = parts

                                    const filter = {
                                        kinds: [Number(kind)],
                                        authors: [pubkey],
                                        '#d': [identifier],
                                    }

                                    const events = await ndk.fetchEvents(filter)
                                    const foundEvent = Array.from(events)[0]

                                    if (foundEvent) {
                                        event = foundEvent
                                    }
                                } else if (favorite.naddr.startsWith('naddr')) {
                                    event = await ndk.fetchEvent(favorite.naddr)
                                } else {
                                    event = await ndk.fetchEvent(favorite.naddr)
                                    if (event) {
                                        console.log(`Successfully fetched event using ID`)
                                    }
                                }
                            } catch (error) {
                                console.error(`Failed to fetch by naddr (${favorite.naddr}):`, error)
                            }
                        }

                        // Only try by event_id if naddr didn't work and the event_id doesn't look like an naddr
                        if (!event && favorite.event_id && !favorite.event_id.startsWith('naddr')) {
                            try {
                                event = await ndk.fetchEvent(favorite.event_id)
                                if (event) {
                                    console.log(`Successfully fetched event using event_id: ${favorite.event_id}`)
                                }
                            } catch (error) {
                                console.error(`Failed to fetch by event_id (${favorite.event_id}):`, error)
                            }
                        }

                        if (event) {
                            try {
                                const parsedStation = parseRadioEventWithSchema(event)

                                // Create the Station object
                                const station: Station = {
                                    id: favorite.event_id,
                                    naddr: favorite.naddr,
                                    name: parsedStation.name,
                                    description: parsedStation.description,
                                    website: parsedStation.website,
                                    streams: parsedStation.streams,
                                    // Properly map tags - Station.tags expects string[][]
                                    tags: parsedStation.eventTags || event.tags,
                                    // Extract image from thumbnail tag
                                    imageUrl: event.tags.find((t) => t[0] === 'thumbnail')?.[1] || '',
                                    // Include new fields
                                    countryCode: parsedStation.countryCode,
                                    languageCodes: parsedStation.languageCodes,
                                    pubkey: event.pubkey,
                                    created_at: event.created_at || Math.floor(Date.now() / 1000),
                                    event,
                                }

                                newResolvedStations[favorite.event_id] = {
                                    id: favorite.event_id,
                                    station,
                                    favorite,
                                }
                                console.log(`Successfully resolved station: ${station.name}`)
                            } catch (parseError) {
                                console.error(`Error parsing station data:`, parseError)
                                newResolvedStations[favorite.event_id] = {
                                    id: favorite.event_id,
                                    station: null,
                                    favorite,
                                }
                            }
                        } else {
                            console.warn(`No event found for station ${favorite.event_id}`)
                            newResolvedStations[favorite.event_id] = {
                                id: favorite.event_id,
                                station: null,
                                favorite,
                            }
                        }
                    } catch (fetchError) {
                        console.error(`Error fetching station ${favorite.event_id}:`, fetchError)
                        newResolvedStations[favorite.event_id] = {
                            id: favorite.event_id,
                            station: null,
                            favorite,
                        }
                    }
                }
            }

            setResolvedStations(newResolvedStations)
        }

        resolveStations()
    }, [favoritesLists, ndk?.activeUser?.pubkey])

    const handleCreateNewList = () => {
        setSelectedFavoritesList(undefined)
        setIsDrawerOpen(true)
    }

    const handleEditList = (list: FavoritesList) => {
        setSelectedFavoritesList(list)
        setIsDrawerOpen(true)
    }

    const handleCloseDrawer = () => {
        setIsDrawerOpen(false)
        setSelectedFavoritesList(undefined)
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold font-press-start-2p text-primary">My Favorites Lists</h2>
                <Button onClick={handleCreateNewList}>
                    <Plus className="mr-2 h-4 w-4" />
                    New List
                </Button>
            </div>

            {isLoading ? (
                <div className="text-center">Loading favorites lists...</div>
            ) : favoritesLists.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                        <Heart className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="font-semibold text-lg mb-2">No Favorites Lists Yet</h3>
                        <p className="text-muted-foreground mb-4">
                            Create your first favorites list to organize your favorite radio stations
                        </p>
                        <Button onClick={handleCreateNewList}>
                            <Plus className="mr-2 h-4 w-4" />
                            Create Your First List
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {favoritesLists.map((list) => (
                        <Card key={list.id} className="w-full overflow-hidden">
                            {list.banner && (
                                <div className="relative w-full h-32">
                                    <img
                                        src={list.banner}
                                        alt={`${list.name} banner`}
                                        className="w-full h-32 object-cover"
                                        onError={(e) => {
                                            // Hide the image on error
                                            ;(e.target as HTMLImageElement).style.display = 'none'
                                        }}
                                    />
                                </div>
                            )}
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-4 items-center">
                                        {list.image && (
                                            <div className="relative w-12 h-12 rounded-md overflow-hidden shrink-0">
                                                <img
                                                    src={list.image}
                                                    alt={`${list.name} thumbnail`}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        // Hide the image on error
                                                        ;(e.target as HTMLImageElement).style.display = 'none'
                                                    }}
                                                />
                                            </div>
                                        )}
                                        <div>
                                            <CardTitle className="text-lg font-semibold">{list.name}</CardTitle>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                {list.description || 'No description'}
                                            </p>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => handleEditList(list)}>
                                        <Edit className="mr-2 h-4 w-4" />
                                        Edit
                                    </Button>
                                </div>
                            </CardHeader>

                            <CardContent className="p-2">
                                <div className="flex flex-col gap-4">
                                    {list.favorites && list.favorites.length > 0 ? (
                                        list.favorites.map((favorite) => {
                                            // Skip invalid favorites
                                            if (!favorite.event_id) {
                                                return null
                                            }

                                            const resolved = resolvedStations[favorite.event_id]
                                            if (!resolved) {
                                                return (
                                                    <div
                                                        key={favorite.event_id}
                                                        className="text-center py-4 text-muted-foreground"
                                                    >
                                                        Loading station...
                                                    </div>
                                                )
                                            }
                                            if (!resolved.station) {
                                                return (
                                                    <div
                                                        key={favorite.event_id}
                                                        className="text-center py-4 text-destructive"
                                                    >
                                                        Failed to load station: {favorite.name}
                                                    </div>
                                                )
                                            }
                                            return <RadioCard key={favorite.event_id} station={resolved.station} />
                                        })
                                    ) : (
                                        <div className="text-center py-4 text-muted-foreground">
                                            No stations in this list yet
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Drawer for creating/editing favorites lists */}
            <EditFavoritesListDrawer
                favoritesList={selectedFavoritesList}
                isOpen={isDrawerOpen}
                onClose={handleCloseDrawer}
            />
        </div>
    )
}
