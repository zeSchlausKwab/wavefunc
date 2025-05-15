import { FavoritesManager } from '@wavefunc/common'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/favourites')({
    component: Favourites,
})

function Favourites() {
    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold mb-6">Favorites</h1>
            <FavoritesManager />
        </div>
    )
}
