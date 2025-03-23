import { FavoritesManager } from '@/components/favorites/FavoritesManager'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/favourites')({
    component: Favourites,
})

function Favourites() {
    return (
        <div className="p-2">
            <h1 className="text-2xl font-bold">Favorites</h1>
            <FavoritesManager />
        </div>
    )
}
