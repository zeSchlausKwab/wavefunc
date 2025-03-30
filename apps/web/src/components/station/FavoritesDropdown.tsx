import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/lib/hooks/use-toast'
import { useNDK } from '@/lib/store/ndk'
import {
    addStationToFavorites,
    fetchFavoritesLists,
    subscribeToFavoritesLists,
    updateFavoritesList,
} from '@wavefunc/common'
import type { FavoritesList } from '@wavefunc/common/nostr/favorites'
import type { Station } from '@wavefunc/common/types/station'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

interface FavoritesDropdownProps {
    station: Station
    currentListId?: string
}

export function FavoritesDropdown({
    station,
    currentListId,
}: FavoritesDropdownProps) {
    const [selectedListId, setSelectedListId] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)
    const [favoritesLists, setFavoritesLists] = useState<FavoritesList[]>([])
    const { toast } = useToast()
    const { ndk } = useNDK()

    useEffect(() => {
        const pubkey = ndk?.activeUser?.pubkey

        if (!pubkey || !ndk) {
            console.log('No pubkey or NDK, clearing state')
            setFavoritesLists([])
            return
        }

        setIsLoading(true)

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

        return () => {
            subscription?.stop()
            setFavoritesLists([])
        }
    }, [ndk?.activeUser?.pubkey])

    useEffect(() => {
        if (favoritesLists.length > 0) {
            if (currentListId) {
                setSelectedListId(currentListId)
            } else {
                setSelectedListId(favoritesLists[0].id)
            }
        }
    }, [favoritesLists, currentListId])

    const handleAddToFavorites = async () => {
        if (!selectedListId) return

        try {
            if (!ndk?.activeUser?.pubkey) {
                console.log('No user logged in')
                return
            }

            const selectedList = favoritesLists.find((list) => list.id === selectedListId)
            if (!selectedList) return

            await addStationToFavorites(ndk, selectedList, {
                id: station.id,
                name: station.name,
                naddr: station.naddr,
            })
            toast({
                title: 'Station added to favorites',
                description: 'Station added to favorites',
            })
        } catch (error) {
            console.error('Error adding station to favorites:', error)
        }
    }

    const handleRemoveFromFavorites = async () => {
        if (!currentListId) return

        try {
            if (!ndk?.activeUser?.pubkey) {
                console.log('No user logged in')
                return
            }

            const currentList = favoritesLists.find((list) => list.id === currentListId)
            if (!currentList) return

            const updatedFavorites = currentList.favorites.filter((f) => f.event_id !== station.id)

            await updateFavoritesList(ndk, currentList, {
                name: currentList.name,
                description: currentList.description,
                favorites: updatedFavorites,
            })
        } catch (error) {
            console.error('Error removing station from favorites:', error)
        }
    }

    if (currentListId) {
        return (
            <div className="flex items-center space-x-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRemoveFromFavorites}
                    title="Remove from list"
                    className="text-destructive hover:text-destructive"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        )
    }

    if (!ndk?.activeUser?.pubkey) {
        return (
            <div className="flex items-center space-x-2">
                <Select disabled>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Login to add to favorites" />
                    </SelectTrigger>
                </Select>
                <Button variant="ghost" size="icon" disabled>
                    <Plus className="h-4 w-4 text-primary" />
                </Button>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex items-center space-x-2">
                <Select disabled>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Loading lists..." />
                    </SelectTrigger>
                </Select>
                <Button variant="ghost" size="icon" disabled>
                    <Plus className="h-4 w-4 text-primary" />
                </Button>
            </div>
        )
    }

    if (!Array.isArray(favoritesLists) || favoritesLists.length === 0) {
        return (
            <div className="flex items-center space-x-2">
                <Select disabled>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="No lists available" />
                    </SelectTrigger>
                </Select>
                <Button variant="ghost" size="icon" disabled>
                    <Plus className="h-4 w-4 text-primary" />
                </Button>
            </div>
        )
    }

    return (
        <div className="flex items-center space-x-2">
            <Select value={selectedListId || undefined} onValueChange={setSelectedListId}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select a list">
                        {selectedListId
                            ? favoritesLists.find((list) => list.id === selectedListId)?.name
                            : 'Select a list'}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {favoritesLists.map((list) => (
                        list.id ? (
                            <SelectItem key={list.id} value={list.id}>
                                {list.name}
                            </SelectItem>
                        ) : null
                    ))}
                </SelectContent>
            </Select>
            <Button
                variant="ghost"
                size="icon"
                onClick={handleAddToFavorites}
                disabled={!selectedListId}
                title="Add to selected list"
            >
                <Plus className="h-4 w-4 text-primary" />
            </Button>
        </div>
    )
}
