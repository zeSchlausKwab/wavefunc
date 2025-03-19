import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpandableStationCard } from './station/ExpandableStationCard'
import type { Station } from '@wavefunc/common/types/station'

interface StationGroupProps {
    name: string
    description: string
    stations: Station[]
    onUpdateStation: (updatedStation: Station) => void
}

export function StationGroup({ name, description, stations, onUpdateStation }: StationGroupProps) {
    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-bold text-primary font-press-start-2p">{name}</h3>
                <p className="text-sm text-muted-foreground font-press-start-2p">{description}</p>
            </div>
            <div className="flex flex-col gap-4">
                {stations.map((station) => (
                    <ExpandableStationCard key={station.id} station={station} onUpdate={onUpdateStation} />
                ))}
            </div>
        </div>
    )
}
