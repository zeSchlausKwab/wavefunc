import { FavoritesManager } from '@/components/favorites/FavoritesManager'
import { TopClickedStations } from '@/components/radio/TopClickedStations'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
    component: Index,
})

function Index() {
    return (
        <div className="home-page">
            <TopClickedStations />
            <FavoritesManager />
        </div>
    )
}
