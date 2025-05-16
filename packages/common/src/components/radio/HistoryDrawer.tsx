import { useEffect, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { cn, closeHistoryDrawer, uiStore, playStation } from '@wavefunc/common'
import { formatDistanceToNow } from '@wavefunc/common/src/lib/utils/formatters'
import { historyStore } from '@wavefunc/common/src/lib/store/history'
import { Button } from '@wavefunc/ui/components/ui/button'
import { X, Clock, Radio } from 'lucide-react'
import type { HistoryEntry } from '@wavefunc/common/src/lib/store/history'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@wavefunc/ui/components/ui/sheet'

export function HistoryDrawer() {
    const isOpen = useStore(uiStore, (state) => state.historyDrawer.isOpen)
    const historyEntries = useStore(historyStore, (state) => state.entries)
    const [mounted, setMounted] = useState(false)

    // Avoid hydration issues by rendering after mount
    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    const handlePlayStation = (entry: HistoryEntry) => {
        playStation(entry.station)
        closeHistoryDrawer()
    }

    return (
        <Sheet
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) closeHistoryDrawer()
            }}
        >
            <SheetContent className="sm:max-w-md w-[90vw] border-l-4 border-black">
                <SheetHeader className="mb-6">
                    <div className="flex justify-between items-center">
                        <SheetTitle className="flex items-center">
                            <Clock className="mr-2 h-5 w-5" />
                            Play History
                        </SheetTitle>
                        <Button variant="ghost" size="icon" onClick={closeHistoryDrawer} className="h-8 w-8">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </SheetHeader>

                <div className="flex flex-col gap-2 overflow-y-auto max-h-[80vh]">
                    {historyEntries.length === 0 ? (
                        <div className="text-center py-8">
                            <Radio className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                            <p className="text-muted-foreground">No listening history yet</p>
                        </div>
                    ) : (
                        historyEntries.map((entry) => (
                            <div
                                key={entry.stationCoordinates + entry.timestamp}
                                className={cn(
                                    'border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors',
                                    'flex items-center gap-3',
                                )}
                                onClick={() => handlePlayStation(entry)}
                            >
                                <div className="flex-shrink-0 w-10 h-10 rounded-md overflow-hidden bg-muted">
                                    {entry.station.imageUrl ? (
                                        <img
                                            src={entry.station.imageUrl}
                                            alt={entry.station.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <Radio className="w-full h-full p-2 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex-grow min-w-0">
                                    <div className="font-medium truncate">{entry.station.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        Played {formatDistanceToNow(new Date(entry.timestamp))}
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" className="flex-shrink-0 h-8 w-8 p-0">
                                    <Radio className="h-4 w-4" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
