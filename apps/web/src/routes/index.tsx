import { BaseStationGrid } from '@/components/radio/BaseStationGrid'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
    component: Index,
})

function Index() {
    return (
        <div className="home-page">
            <BaseStationGrid />
        </div>
    )
}
