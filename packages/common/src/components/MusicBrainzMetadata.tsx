import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { Separator } from '@wavefunc/ui/components/ui/separator'
import { cn } from '@wavefunc/common'
import type { RecognitionResult } from '@wavefunc/common/src/types/recognition'
import { ExternalLink, Music, Users, Disc } from 'lucide-react'

interface MusicBrainzMetadataProps {
    result: RecognitionResult
    className?: string
}

export function MusicBrainzMetadata({ result, className }: MusicBrainzMetadataProps) {
    const { musicbrainz } = result

    if (!musicbrainz) {
        return null
    }

    // Check if musicbrainz has any meaningful data
    const hasRecordingData = musicbrainz.recording && Object.keys(musicbrainz.recording).length > 0
    const hasArtistsData = musicbrainz.artists && musicbrainz.artists.length > 0
    const hasReleaseData = musicbrainz.release && Object.keys(musicbrainz.release).length > 0
    const hasReleaseGroupData = musicbrainz['release-group'] && Object.keys(musicbrainz['release-group']).length > 0
    const hasLabelsData = musicbrainz.labels && musicbrainz.labels.length > 0

    const hasData = hasRecordingData || hasArtistsData || hasReleaseData || hasReleaseGroupData || hasLabelsData
    if (!hasData) {
        return null
    }

    const formatDuration = (ms?: number) => {
        if (!ms) return null
        const minutes = Math.floor(ms / 60000)
        const seconds = ((ms % 60000) / 1000).toFixed(0)
        return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`
    }

    return (
        <Card className={cn('border-blue-200 dark:border-blue-800', className)}>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Music className="h-5 w-5 text-blue-600" />
                    MusicBrainz Metadata
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Recording Information */}
                {musicbrainz.recording && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Disc className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">Recording</span>
                        </div>
                        <div className="grid gap-1 text-sm pl-6">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Title</span>
                                <span className="font-medium">{musicbrainz.recording.title}</span>
                            </div>
                            {musicbrainz.recording.disambiguation && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Note</span>
                                    <span className="text-orange-600 text-xs">
                                        {musicbrainz.recording.disambiguation}
                                    </span>
                                </div>
                            )}
                            {musicbrainz.recording.length && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Length</span>
                                    <span>{formatDuration(musicbrainz.recording.length)}</span>
                                </div>
                            )}
                            {musicbrainz.recording.id && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">MBID</span>
                                    <a
                                        href={`https://musicbrainz.org/recording/${musicbrainz.recording.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                                    >
                                        {musicbrainz.recording.id.slice(0, 8)}...
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Artists Information */}
                {musicbrainz.artists && musicbrainz.artists.length > 0 && (
                    <>
                        <Separator />
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">Artists</span>
                            </div>
                            <div className="grid gap-2 pl-6">
                                {musicbrainz.artists.map((artist, index) => (
                                    <div key={artist.id} className="space-y-1">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <div className="font-medium text-sm">{artist.name}</div>
                                                {artist['sort-name'] !== artist.name && (
                                                    <div className="text-xs text-muted-foreground">
                                                        Sort: {artist['sort-name']}
                                                    </div>
                                                )}
                                                {artist.disambiguation && (
                                                    <Badge variant="outline" className="text-xs">
                                                        {artist.disambiguation}
                                                    </Badge>
                                                )}
                                            </div>
                                            <a
                                                href={`https://musicbrainz.org/artist/${artist.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                                            >
                                                View <ExternalLink className="h-3 w-3" />
                                            </a>
                                        </div>
                                        {index < (musicbrainz.artists?.length || 0) - 1 && (
                                            <Separator className="my-2" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* Release Information */}
                {musicbrainz.release && (
                    <>
                        <Separator />
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Disc className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">Release</span>
                            </div>
                            <div className="grid gap-1 text-sm pl-6">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Title</span>
                                    <span className="font-medium">{musicbrainz.release.title}</span>
                                </div>
                                {musicbrainz.release.date && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Date</span>
                                        <span>{musicbrainz.release.date}</span>
                                    </div>
                                )}
                                {musicbrainz.release.country && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Country</span>
                                        <span>{musicbrainz.release.country}</span>
                                    </div>
                                )}
                                {musicbrainz.release.id && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">MBID</span>
                                        <a
                                            href={`https://musicbrainz.org/release/${musicbrainz.release.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                                        >
                                            {musicbrainz.release.id.slice(0, 8)}...
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* Release Group Information */}
                {musicbrainz['release-group'] && (
                    <>
                        <Separator />
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Disc className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">Release Group</span>
                            </div>
                            <div className="grid gap-1 text-sm pl-6">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Title</span>
                                    <span className="font-medium">{musicbrainz['release-group'].title}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Type</span>
                                    <Badge variant="secondary" className="text-xs">
                                        {musicbrainz['release-group']['primary-type']}
                                    </Badge>
                                </div>
                                {musicbrainz['release-group']['secondary-types'] &&
                                    musicbrainz['release-group']['secondary-types'].length > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Secondary</span>
                                            <div className="flex gap-1">
                                                {musicbrainz['release-group']['secondary-types'].map((type) => (
                                                    <Badge key={type} variant="outline" className="text-xs">
                                                        {type}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                {musicbrainz['release-group'].id && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">MBID</span>
                                        <a
                                            href={`https://musicbrainz.org/release-group/${musicbrainz['release-group'].id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                                        >
                                            {musicbrainz['release-group'].id.slice(0, 8)}...
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* Labels Information */}
                {musicbrainz.labels && musicbrainz.labels.length > 0 && (
                    <>
                        <Separator />
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Badge className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">Labels</span>
                            </div>
                            <div className="grid gap-2 pl-6">
                                {musicbrainz.labels.map((labelInfo, index) => (
                                    <div key={index} className="space-y-1">
                                        {labelInfo.label && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Label</span>
                                                <a
                                                    href={`https://musicbrainz.org/label/${labelInfo.label.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
                                                >
                                                    {labelInfo.label.name}
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            </div>
                                        )}
                                        {labelInfo['catalog-number'] && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Catalog #</span>
                                                <span className="text-sm font-mono">{labelInfo['catalog-number']}</span>
                                            </div>
                                        )}
                                        {index < (musicbrainz.labels?.length || 0) - 1 && (
                                            <Separator className="my-2" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
