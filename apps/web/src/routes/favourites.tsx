import { FavoritesManager } from '@wavefunc/common'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/favourites')({
    component: Favourites,
})

function Favourites() {
    return (
        <div>
            <h1 className="text-2xl font-bold">Favorites</h1>
            <FavoritesManager />
        </div>
    )
}
