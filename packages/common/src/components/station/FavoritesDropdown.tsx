import {
    addStationToFavorites,
    updateFavoritesList,
    useFavoritesLists,
    authStore,
    ndkActions,
    type FavoritesList,
} from '@wavefunc/common'
import type { Station } from '@wavefunc/common/src/types/station'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wavefunc/ui/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { toast } from 'sonner'

interface FavoritesDropdownProps {
    station: Station
    currentListId?: string
}

export function FavoritesDropdown({ station, currentListId }: FavoritesDropdownProps) {
    const [selectedListId, setSelectedListId] = useState<string>('')
    const user = useStore(authStore, (state) => state.user)
    const userPubkey = user?.pubkey

    // Use the favorites query hook
    const { data: favoritesLists = [], isLoading } = useFavoritesLists(userPubkey || '')

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
        if (!selectedListId || !userPubkey) return

        try {
            const ndk = ndkActions.getNDK()
            if (!ndk) {
                console.log('NDK not available')
                return
            }

            const selectedList = favoritesLists.find((list) => list.id === selectedListId)
            if (!selectedList) return

            await addStationToFavorites(ndk, selectedList, {
                id: station.id,
                name: station.name,
                naddr: station.naddr,
                pubkey: station.pubkey,
                tags: station.tags,
            })
            toast('Station added to favorites', {
                description: 'Station added to favorites',
            })
        } catch (error) {
            console.error('Error adding station to favorites:', error)
        }
    }

    const handleRemoveFromFavorites = async () => {
        if (!currentListId || !userPubkey) return

        try {
            const ndk = ndkActions.getNDK()
            if (!ndk) {
                console.log('NDK not available')
                return
            }

            const currentList = favoritesLists.find((list) => list.id === currentListId)
            if (!currentList) return

            const updatedFavorites = currentList.favorites.filter((f) => f.event_id !== station.id)

            await updateFavoritesList(
                ndk,
                currentList,
                {
                    name: currentList.name,
                    description: currentList.description,
                },
                updatedFavorites,
            )
        } catch (error) {
            console.error('Error removing station from favorites:', error)
        }
    }

    if (currentListId) {
        return (
            <div className="flex items-center">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFromFavorites}
                    title="Remove from list"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-red-50"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        )
    }

    if (!userPubkey) {
        return (
            <div className="flex flex-col w-full">
                <div className="flex items-center space-x-1">
                    <Select disabled>
                        <SelectTrigger className="h-8 text-xs w-full max-w-[100px] px-2">
                            <SelectValue placeholder="Login" />
                        </SelectTrigger>
                    </Select>
                    <Button variant="ghost" size="sm" disabled className="h-8 w-8 p-0">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex flex-col w-full">
                <div className="flex items-center space-x-1">
                    <Select disabled>
                        <SelectTrigger className="h-8 text-xs w-full max-w-[100px] px-2">
                            <SelectValue placeholder="Loading" />
                        </SelectTrigger>
                    </Select>
                    <Button variant="ghost" size="sm" disabled className="h-8 w-8 p-0">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        )
    }

    if (!Array.isArray(favoritesLists) || favoritesLists.length === 0) {
        return (
            <div className="flex flex-col w-full">
                <div className="flex items-center space-x-1">
                    <Select disabled>
                        <SelectTrigger className="h-8 text-xs w-full max-w-[100px] px-2">
                            <SelectValue placeholder="No lists" />
                        </SelectTrigger>
                    </Select>
                    <Button variant="ghost" size="sm" disabled className="h-8 w-8 p-0">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col w-full">
            <div className="flex items-center space-x-1">
                <Select value={selectedListId || undefined} onValueChange={setSelectedListId}>
                    <SelectTrigger className="h-8 text-xs w-full max-w-[100px] px-2">
                        <SelectValue placeholder="List">
                            {selectedListId ? favoritesLists.find((list) => list.id === selectedListId)?.name : 'List'}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" className="min-w-[160px]">
                        {favoritesLists.map((list) =>
                            list.id ? (
                                <SelectItem key={list.id} value={list.id} className="text-xs py-2">
                                    {list.name}
                                </SelectItem>
                            ) : null,
                        )}
                    </SelectContent>
                </Select>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddToFavorites}
                    disabled={!selectedListId}
                    title="Add to selected list"
                    className="h-8 w-8 p-0"
                >
                    <Plus className="h-4 w-4 text-primary" />
                </Button>
            </div>
        </div>
    )
}
