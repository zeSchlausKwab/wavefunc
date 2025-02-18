import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Pause, Play, SkipBack, SkipForward } from "lucide-react"

interface Station {
  id: number
  name: string
  genre: string
  url: string
  imageUrl: string
  currentSong?: string
  bitrate?: number
  website?: string
}

interface RadioPlayerProps {
  station: Station | null
  isPlaying: boolean
  onPlayPause: () => void
  onSkipForward: () => void
  onSkipBack: () => void
}

export function RadioPlayer({ station, isPlaying, onPlayPause, onSkipForward, onSkipBack }: RadioPlayerProps) {
  return (
    <Card className="w-full bg-white shadow-lg border-t border-gray-200">
      <CardContent className="p-2 sm:p-4">
        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="relative w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0">
            <Image
              src={station?.imageUrl || "/placeholder.svg?height=200&width=200&text=No+Station"}
              alt={station?.name || "No station selected"}
              fill
              style={{ objectFit: "cover" }}
              className="rounded-md"
            />
          </div>
          <div className="flex-grow min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-primary font-press-start-2p truncate">
              {station?.name || "No station selected"}
            </h3>
            <p className="text-xs text-muted-foreground font-press-start-2p mt-1 truncate">
              {station?.currentSong || "Select a station to play"}
            </p>
            {station && (
              <div className="hidden sm:block mt-1">
                <p className="text-xs text-muted-foreground font-press-start-2p truncate">
                  <span className="font-semibold">Genre:</span> {station.genre}
                </p>
                <p className="text-xs text-muted-foreground font-press-start-2p truncate">
                  <span className="font-semibold">Bitrate:</span> {station.bitrate || "Unknown"} kbps
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end space-y-1">
            <div className="flex items-center space-x-1 sm:space-x-2">
              <Button variant="outline" size="icon" onClick={onSkipBack} disabled={!station}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={onPlayPause} disabled={!station}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={onSkipForward} disabled={!station}>
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
            {station && (
              <a
                href={station.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline font-press-start-2p hidden sm:inline-block"
              >
                Visit Website
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

