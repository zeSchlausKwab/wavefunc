import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ExpandableStationCard } from "./ExpandableStationCard";
import { Station } from "@wavefunc/common";

interface StationGroupProps {
  name: string;
  description: string;
  stations: Station[];
  onUpdateStation: (updatedStation: Station) => void;
  onPlayStation: (station: Station) => void;
}

export function StationGroup({
  name,
  description,
  stations,
  onUpdateStation,
  onPlayStation,
}: StationGroupProps) {
  return (
    <Card className="w-full bg-white bg-opacity-90 shadow-lg mb-6">
      <CardHeader>
        <CardTitle className="text-primary text-lg font-press-start-2p">
          {name}
        </CardTitle>
        <CardDescription className="text-sm font-press-start-2p mt-1">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {stations.map((station) => (
            <ExpandableStationCard
              key={station.id}
              station={station}
              onUpdate={onUpdateStation}
              onPlay={onPlayStation}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
