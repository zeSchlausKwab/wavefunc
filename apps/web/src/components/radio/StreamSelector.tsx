import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Stream } from '@wavefunc/common'
import { useMedia } from 'react-use'
import { cn } from '@/lib/utils'

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

    return (
        <div className={cn('space-y-1', isMobile && 'w-full')}>
            <div className={cn('flex items-center gap-1', !isMobile && 'gap-2')}>
                {!isMobile && <label className="text-sm font-medium">Quality:</label>}
                <Select
                    value={selectedStreamId?.toString()}
                    onValueChange={(value) => {
                        const stream = streams.find((s) => s.url === value)
                        if (stream) {
                            handleStreamSelect(stream)
                        }
                    }}
                >
                    <SelectTrigger className={cn(isMobile ? 'w-full h-7 text-xs px-2' : 'w-[180px]')}>
                        <SelectValue placeholder={isMobile ? 'Quality' : 'Select quality'} />
                    </SelectTrigger>
                    <SelectContent>
                        {streams.map((stream, index) => (
                            <SelectItem
                                key={`${stream.quality.bitrate}-${stream.quality.codec}-${stream.url}-${index}`}
                                value={stream.url}
                                className={cn(isMobile && 'text-xs h-7')}
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
            {selectedStreamId && !isMobile && (
                <div className="text-xs text-muted-foreground">
                    <p>Codec: {streams.find((s) => s.url === selectedStreamId.toString())?.quality.codec}</p>
                    <p>
                        Bitrate:{' '}
                        {streams.find((s) => s.url === selectedStreamId.toString())?.quality.bitrate
                            ? `${Math.round(streams.find((s) => s.url === selectedStreamId.toString())!.quality.bitrate / 1000)} kbps`
                            : 'Unknown'}
                    </p>
                    <p>
                        Sample Rate:{' '}
                        {streams.find((s) => s.url === selectedStreamId.toString())?.quality.sampleRate
                            ? `${streams.find((s) => s.url === selectedStreamId.toString())!.quality.sampleRate} Hz`
                            : 'Unknown'}
                    </p>
                </div>
            )}
        </div>
    )
}
