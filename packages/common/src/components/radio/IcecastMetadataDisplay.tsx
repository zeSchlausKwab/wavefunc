'use client'

import type { IcecastMetadata, IcecastSource } from '../RadioPlayer'
import { formatDistanceToNow } from 'date-fns'

interface IcecastMetadataDisplayProps {
    metadata: IcecastMetadata
}

export function IcecastMetadataDisplay({ metadata }: IcecastMetadataDisplayProps) {
    const sources = Array.isArray(metadata.icestats.source) ? metadata.icestats.source : [metadata.icestats.source]

    // Get total listeners count across all sources
    const totalListeners = sources.reduce((total, source) => total + (source.listeners || 0), 0)

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Icecast Stream Info</h3>
                <div className="px-2 py-1 bg-blue-100 border border-blue-300 rounded-md text-blue-800 font-medium">
                    {totalListeners} Listener{totalListeners !== 1 ? 's' : ''} Online
                </div>
            </div>

            {sources.map((source, index) => (
                <SourceDetails key={index} source={source} />
            ))}
        </div>
    )
}

function SourceDetails({ source }: { source: IcecastSource }) {
    // Some Icecast servers store different fields for the current song
    const currentSong = source.title || source.song || 'Unknown'

    return (
        <div className="border-t border-blue-200 pt-2">
            {source.server_name && (
                <div className="mb-1">
                    <span className="font-medium">Source: </span>
                    {source.server_name}
                    {source.genre && ` (${source.genre})`}
                </div>
            )}

            {source.bitrate && (
                <div className="text-xs text-gray-600 mb-2">
                    {source.bitrate}kbps {source.server_type}
                </div>
            )}

            <div className="mb-2">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Now Playing</div>
                <div className="font-medium text-sm">{currentSong}</div>
            </div>

            {source.song_history && source.song_history.length > 0 && (
                <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Recent History</div>
                    <ul className="space-y-1">
                        {source.song_history.map((song, idx) => (
                            <li key={idx} className="text-sm">
                                <div className="flex justify-between">
                                    <span>{song.title}</span>
                                    {typeof song.played_at === 'number' && (
                                        <span className="text-xs text-gray-500">
                                            {formatDistanceToNow(new Date(song.played_at * 1000), { addSuffix: true })}
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
