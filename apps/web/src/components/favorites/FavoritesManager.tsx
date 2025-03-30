import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ndkActions, ndkStore } from '@/lib/store/ndk'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useStore } from '@tanstack/react-store'
import type { Station } from '@wavefunc/common'
import {
    type FavoritesList,
    fetchFavoritesLists,
    generateStationNaddr,
    parseRadioEvent,
    subscribeToFavoritesLists,
} from '@wavefunc/common'
import { Edit, Heart, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { RadioCard } from '../radio/RadioCard'
import { EditFavoritesListDrawer } from './EditFavoritesListDrawer'

interface ResolvedStation {
    id: string
    station: Station | null
    favorite: {
        event_id: string
        name: string
        added_at: number
        naddr?: string
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
            throw new Error('NDK not initialized')
        }
        const pubkey = ndk?.activeUser?.pubkey

        if (!pubkey) {
            setFavoritesLists([])
            setResolvedStations({})
            return
        }

        setIsLoading(true)

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
    }, [ndk?.activeUser?.pubkey, ndk]) // Depend on pubkey changes

    // Effect to resolve stations when favorites lists change
    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) {
            throw new Error('NDK not initialized')
        }
        if (!ndk?.activeUser?.pubkey || favoritesLists.length === 0) {
            return
        }

        const resolveStations = async () => {
            const newResolvedStations: Record<string, ResolvedStation> = {}

            for (const list of favoritesLists) {
                for (const favorite of list.favorites) {
                    if (newResolvedStations[favorite.event_id]) continue

                    try {
                        let event: NDKEvent | null = null

                        if (favorite.naddr) {
                            event = await ndk.fetchEvent(favorite.naddr)
                        } else {
                            event = await ndk.fetchEvent(favorite.event_id)
                        }

                        if (event) {
                            try {
                                const parsedStation = parseRadioEvent(event)

                                // Make sure to get the naddr if available
                                let naddr = favorite.naddr
                                if (!naddr && event) {
                                    try {
                                        naddr = generateStationNaddr(event)
                                    } catch (error) {
                                        console.warn('Could not generate naddr for station:', error)
                                    }
                                }

                                const station: Station = {
                                    id: favorite.event_id,
                                    naddr, // Use the generated naddr or the one from the favorite
                                    name: parsedStation.name,
                                    description: parsedStation.description,
                                    website: parsedStation.website,
                                    streams: parsedStation.streams,
                                    // Properly map tags - Station.tags expects string[][]
                                    tags: parsedStation.eventTags || event.tags,
                                    // Extract genre from tags with proper null checks
                                    genre: event.tags.find((t) => t[0] === 'genre')?.[1] || '',
                                    imageUrl: event.tags.find((t) => t[0] === 'thumbnail')?.[1] || '',
                                    // Include new fields from radio-browser.info
                                    countryCode: parsedStation.countryCode,
                                    languageCodes: parsedStation.languageCodes,
                                    pubkey: event.pubkey,
                                    created_at: favorite.added_at,
                                }

                                newResolvedStations[favorite.event_id] = {
                                    id: favorite.event_id,
                                    station,
                                    favorite,
                                }
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
        <div className="my-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold font-press-start-2p text-primary">My Favorites Lists</h2>
                <Button onClick={handleCreateNewList}>
                    <Plus className="mr-2 h-4 w-4" />
                    New List
                </Button>
            </div>

            {isLoading ? (
                <div className="text-center py-8">Loading favorites lists...</div>
            ) : favoritesLists.length === 0 ? (
                <Card className="border-dashed border-2 border-muted-foreground bg-muted/20">
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
                        <Card key={list.id} className="w-full">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <CardTitle className="text-lg font-semibold">{list.name}</CardTitle>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {list.description || 'No description'}
                                        </p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => handleEditList(list)}>
                                        <Edit className="mr-2 h-4 w-4" />
                                        Edit
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-4">
                                    {list.favorites.map((favorite) => {
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
                                        return (
                                            <RadioCard
                                                key={favorite.event_id}
                                                station={resolved.station}
                                                currentListId={list.id}
                                            />
                                        )
                                    })}
                                    {list.favorites.length === 0 && (
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
