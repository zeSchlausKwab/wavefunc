import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wavefunc/ui/components/ui/select'
import { cn } from '@wavefunc/common'
import type { Stream } from '@wavefunc/common'
import * as React from 'react'
import { useMedia } from 'react-use'

interface StreamSelectorProps {
    stationId: number
    streams: Stream[]
    selectedStreamId: number | null | undefined
    onStreamSelect: (stream: Stream) => void
}

export function StreamSelector({ stationId, streams, selectedStreamId, onStreamSelect }: StreamSelectorProps) {
    const isMobile = useMedia('(max-width: 640px)')
    const handleStreamSelect = (stream: Stream) => {
        onStreamSelect(stream)
    }

    // Find the stream by bitrate for the value
    const selectedStream = React.useMemo(() => {
        return streams.find((s) => s.quality.bitrate === selectedStreamId)
    }, [streams, selectedStreamId])

    return (
        <div className={cn('space-y-1', isMobile && 'w-full')}>
            <div className={cn('flex items-center gap-1', !isMobile && 'gap-2')}>
                {!isMobile && <label className="text-sm font-medium">Quality:</label>}
                <Select
                    value={selectedStream?.url}
                    onValueChange={(value) => {
                        const stream = streams.find((s) => s.url === value)
                        if (stream) {
                            handleStreamSelect(stream)
                        }
                    }}
                >
                    <SelectTrigger
                        className={cn(isMobile ? 'w-full h-6 text-[10px] px-2 min-w-[60px]' : 'w-[180px]', 'truncate')}
                    >
                        <SelectValue placeholder={isMobile ? 'Quality' : 'Select quality'} />
                    </SelectTrigger>
                    <SelectContent className={isMobile ? 'min-w-[80px]' : ''}>
                        {streams.map((stream, index) => (
                            <SelectItem
                                key={`${stream.quality.bitrate}-${stream.quality.codec}-${stream.url}-${index}`}
                                value={stream.url}
                                className={cn(isMobile ? 'text-[10px] h-6 py-0' : 'text-xs h-7')}
                            >
                                {stream.quality.bitrate
                                    ? `${Math.round(stream.quality.bitrate / 1000)} kbps`
                                    : 'Unknown'}{' '}
                                {!isMobile && `(${stream.quality.codec})`}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {selectedStream && !isMobile && (
                <div className="text-xs text-muted-foreground">
                    <p>Codec: {selectedStream.quality.codec}</p>
                    <p>
                        Bitrate:{' '}
                        {selectedStream.quality.bitrate
                            ? `${Math.round(selectedStream.quality.bitrate / 1000)} kbps`
                            : 'Unknown'}
                    </p>
                    <p>
                        Sample Rate:{' '}
                        {selectedStream.quality.sampleRate ? `${selectedStream.quality.sampleRate} Hz` : 'Unknown'}
                    </p>
                </div>
            )}
        </div>
    )
}
