import { Server, Waves, Zap, Database, Link2 } from 'lucide-react'
import { type StreamMetadata } from '@/lib/utils/streamUtils'

interface StreamTechnicalInfoProps {
    metadata: Partial<StreamMetadata>
    resolvedUrl?: string | null
    isLoading?: boolean
}

export function StreamTechnicalInfo({ metadata, resolvedUrl, isLoading }: StreamTechnicalInfoProps) {
    return (
        <div className="text-xs text-gray-500 flex flex-wrap gap-3 mt-1">
            {metadata.streamType && (
                <div className="flex items-center gap-1">
                    <Waves className="h-3 w-3" />
                    <span>{metadata.streamType}</span>
                </div>
            )}

            {metadata.icyBitrate && (
                <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    <span>{metadata.icyBitrate} kbps</span>
                </div>
            )}

            {metadata.icySamplerate && (
                <div className="flex items-center gap-1">
                    <Waves className="h-3 w-3" />
                    <span>{metadata.icySamplerate} Hz</span>
                </div>
            )}

            {metadata.hasIcyMetadata && (
                <div className="flex items-center gap-1">
                    <Database className="h-3 w-3" />
                    <span>ICY Metadata</span>
                </div>
            )}

            {resolvedUrl && (
                <div className="flex items-center gap-1">
                    <Link2 className="h-3 w-3" />
                    <span className="truncate max-w-[200px]" title={resolvedUrl}>
                        {resolvedUrl}
                    </span>
                </div>
            )}

            {metadata.icyName && (
                <div className="flex items-center gap-1">
                    <Server className="h-3 w-3" />
                    <span>{metadata.icyName}</span>
                </div>
            )}

            {isLoading && (
                <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span>Loading stream...</span>
                </div>
            )}
        </div>
    )
}
