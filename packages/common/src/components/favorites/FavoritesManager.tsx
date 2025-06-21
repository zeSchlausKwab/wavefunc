import { Button } from '@wavefunc/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { authStore } from '@wavefunc/common'
import { useStore } from '@tanstack/react-store'
import type { FavoritesList } from '@wavefunc/common'
import { useFavoritesLists, useResolvedFavoriteStations } from '../../queries'
import { Edit, Heart, Plus } from 'lucide-react'
import { useState } from 'react'
import { EditFavoritesListDrawer } from './EditFavoritesListDrawer'
import RadioCard from '../radio/RadioCard'

export function FavoritesManager() {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    const [selectedFavoritesList, setSelectedFavoritesList] = useState<FavoritesList | undefined>()
    const user = useStore(authStore, (state) => state.user)
    const userPubkey = user?.pubkey

    // Use the new query hooks
    const { data: favoritesLists = [], isLoading, error } = useFavoritesLists(userPubkey || '')
    const { data: resolvedStationsByList = {} } = useResolvedFavoriteStations(userPubkey || '', {
        enabled: !!userPubkey,
    })

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
            ) : error ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                        <p className="text-red-500 mb-2">Failed to load favorites lists</p>
                        <p className="text-sm text-muted-foreground">
                            {error instanceof Error ? error.message : 'Unknown error'}
                        </p>
                    </CardContent>
                </Card>
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
                                    {(() => {
                                        const resolvedStations = resolvedStationsByList[list.id] || []

                                        if (list.favorites && list.favorites.length > 0) {
                                            if (resolvedStations.length === 0) {
                                                return (
                                                    <div className="text-center py-4 text-muted-foreground">
                                                        Loading stations...
                                                    </div>
                                                )
                                            }

                                            return resolvedStations.map((station) => (
                                                <RadioCard key={station.id} station={station} />
                                            ))
                                        }

                                        return (
                                            <div className="text-center py-4 text-muted-foreground">
                                                No stations in this list yet
                                            </div>
                                        )
                                    })()}
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
