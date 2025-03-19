import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Stream } from '@wavefunc/common'

interface StreamSelectorProps {
    stationId: number
    streams: Stream[]
    selectedStreamId: number | null | undefined
    onStreamSelect: (stream: Stream) => void
}

export function StreamSelector({ stationId, streams, selectedStreamId, onStreamSelect }: StreamSelectorProps) {
    const handleStreamSelect = (stream: Stream) => {
        onStreamSelect(stream)
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Stream Quality:</label>
                <Select
                    value={selectedStreamId?.toString()}
                    onValueChange={(value) => {
                        const stream = streams.find((s) => s.url === value)
                        if (stream) {
                            handleStreamSelect(stream)
                        }
                    }}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select stream quality" />
                    </SelectTrigger>
                    <SelectContent>
                        {streams.map((stream, index) => (
                            <SelectItem
                                key={`${stream.quality.bitrate}-${stream.quality.codec}-${stream.url}-${index}`}
                                value={stream.url}
                            >
                                {stream.quality.bitrate
                                    ? `${Math.round(stream.quality.bitrate / 1000)} kbps`
                                    : 'Unknown'}{' '}
                                ({stream.quality.codec})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {selectedStreamId && (
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
