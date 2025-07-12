import { cn } from '@wavefunc/common'
import { DiscogsMetadata } from '@wavefunc/common/src/components/DiscogsMetadata'
import { MusicBrainzMetadata } from '@wavefunc/common/src/components/MusicBrainzMetadata'
import type { RecognitionResult } from '@wavefunc/common/src/types/recognition'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wavefunc/ui/components/ui/dialog'
import { ExternalLink } from 'lucide-react'
import { RecognitionResultShare } from './RecognitionResultShare'

interface RecognitionResultDialogProps {
    result: RecognitionResult | null
    stationUrl: string
    isOpen: boolean
    onOpenChange: (open: boolean) => void
}

export function RecognitionResultDialog({ result, stationUrl, isOpen, onOpenChange }: RecognitionResultDialogProps) {
    const formatDuration = (ms?: number) => {
        if (!ms) return ''
        const minutes = Math.floor(ms / 60000)
        const seconds = ((ms % 60000) / 1000).toFixed(0)
        return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`
    }

    const getYouTubeEmbedUrl = (url: string) => {
        // Extract video ID from YouTube URL
        const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/, /youtube\.com\/embed\/([^&\n?#]+)/]

        for (const pattern of patterns) {
            const match = url.match(pattern)
            if (match && match[1]) {
                return `https://www.youtube.com/embed/${match[1]}`
            }
        }
        return null
    }

    return (
        <Dialog open={isOpen && !!result} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Song Recognition Result</DialogTitle>
                </DialogHeader>
                {result && (
                    <div className="grid gap-4">
                        <div className="flex items-start gap-4">
                            {result.spotify?.album?.images?.[0]?.url || result.apple_music?.artwork?.url ? (
                                <div className="relative h-24 w-24 overflow-hidden rounded-md">
                                    <img
                                        src={result.spotify?.album?.images?.[0]?.url || '/placeholder.png'}
                                        alt={result.spotify?.album?.name || 'Album cover'}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            ) : null}
                            <div className="flex flex-col">
                                <h3 className="font-semibold">{result.title}</h3>
                                <p className="text-sm text-muted-foreground">{result.artist}</p>
                                {result.album && <p className="text-sm text-muted-foreground">{result.album}</p>}
                            </div>
                        </div>

                        {/* YouTube Video Embed */}
                        {result.youtube_link && (
                            <div className="mb-4">
                                <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted shadow-sm">
                                    <iframe
                                        src={getYouTubeEmbedUrl(result.youtube_link)!}
                                        title={`${result.artist} - ${result.title}`}
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowFullScreen
                                        className="absolute inset-0 w-full h-full"
                                        loading="lazy"
                                    />
                                </div>
                                <RecognitionResultShare result={result} stationUrl={stationUrl} />
                            </div>
                        )}

                        <div className="grid gap-2 text-sm">
                            {result.release_date && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Release Date</span>
                                    <span>{new Date(result.release_date).toLocaleDateString()}</span>
                                </div>
                            )}
                            {(result.spotify?.duration_ms || result.apple_music?.durationInMillis) && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Duration</span>
                                    <span>
                                        {formatDuration(
                                            result.spotify?.duration_ms || result.apple_music?.durationInMillis,
                                        )}
                                    </span>
                                </div>
                            )}
                            {result.apple_music?.genreNames && result.apple_music.genreNames.length > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Genres</span>
                                    <span>{result.apple_music.genreNames.join(', ')}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {result.spotify?.external_urls?.spotify && (
                                <a
                                    href={result.spotify.external_urls.spotify}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                        'inline-flex items-center justify-center gap-2',
                                        'rounded-md bg-[#1DB954] px-3 py-2 text-sm font-semibold text-white',
                                        'hover:bg-[#1DB954]/90',
                                    )}
                                >
                                    Spotify <ExternalLink className="h-4 w-4" />
                                </a>
                            )}
                            {result.apple_music?.url && (
                                <a
                                    href={result.apple_music.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                        'inline-flex items-center justify-center gap-2',
                                        'rounded-md bg-[#FB233B] px-3 py-2 text-sm font-semibold text-white',
                                        'hover:bg-[#FB233B]/90',
                                    )}
                                >
                                    Apple Music <ExternalLink className="h-4 w-4" />
                                </a>
                            )}
                            {result.youtube_link && (
                                <a
                                    href={result.youtube_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                        'inline-flex items-center justify-center gap-2',
                                        'rounded-md bg-[#FF0000] px-3 py-2 text-sm font-semibold text-white',
                                        'hover:bg-[#FF0000]/90',
                                    )}
                                >
                                    YouTube <ExternalLink className="h-4 w-4" />
                                </a>
                            )}
                            {result.song_link && (
                                <a
                                    href={result.song_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                        'inline-flex items-center justify-center gap-2',
                                        'rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground',
                                        'hover:bg-primary/90',
                                    )}
                                >
                                    Listen <ExternalLink className="h-4 w-4" />
                                </a>
                            )}
                        </div>

                        {result.discogs && <DiscogsMetadata result={result} className="mt-4" />}
                        {result.musicbrainz && <MusicBrainzMetadata result={result} className="mt-4" />}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
