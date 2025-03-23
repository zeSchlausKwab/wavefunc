import { FavoritesManager } from '@/components/favorites/FavoritesManager'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/favourites')({
    component: Favorites,
})

function Favorites() {
    return (
        <div className="p-2">
            <FavoritesManager />
        </div>
    )
}
