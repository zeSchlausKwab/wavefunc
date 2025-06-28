import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { Separator } from '@wavefunc/ui/components/ui/separator'
import { cn } from '@wavefunc/common'
import type { RecognitionResult } from '@wavefunc/common/src/types/recognition'
import { ExternalLink, Music, Users, Disc, Calendar, MapPin } from 'lucide-react'

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
    const hasRecordingData = musicbrainz.recording?.recordings && musicbrainz.recording.recordings.length > 0
    const hasReleaseData = musicbrainz.release?.releases && musicbrainz.release.releases.length > 0

    const hasData = hasRecordingData || hasReleaseData

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
                    <Badge variant="secondary" className="text-xs">
                        {musicbrainz.recording?.count || 0} recordings, {musicbrainz.release?.count || 0} releases
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Recording Information */}
                {hasRecordingData && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Disc className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">Recordings</span>
                        </div>
                        <div className="space-y-4 pl-6">
                            {musicbrainz.recording!.recordings.slice(0, 3).map((recording, index) => (
                                <div key={recording.id} className="space-y-2">
                                    <div className="grid gap-1 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Title</span>
                                            <span className="font-medium">{recording.title}</span>
                                        </div>
                                        {recording.disambiguation && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Note</span>
                                                <span className="text-orange-600 text-xs">
                                                    {recording.disambiguation}
                                                </span>
                                            </div>
                                        )}
                                        {recording.length && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Length</span>
                                                <span>{formatDuration(recording.length)}</span>
                                            </div>
                                        )}
                                        {recording.score && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Match Score</span>
                                                <Badge
                                                    variant={recording.score === 100 ? 'default' : 'secondary'}
                                                    className="text-xs"
                                                >
                                                    {recording.score}%
                                                </Badge>
                                            </div>
                                        )}
                                        {recording['artist-credit'] && recording['artist-credit'].length > 0 && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Artist</span>
                                                <span className="text-sm">
                                                    {recording['artist-credit'].map((ac) => ac.name).join(' & ')}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">MBID</span>
                                            <a
                                                href={`https://musicbrainz.org/recording/${recording.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                                            >
                                                {recording.id.slice(0, 8)}...
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        </div>
                                    </div>
                                    {index < Math.min(musicbrainz.recording!.recordings.length, 3) - 1 && (
                                        <Separator className="my-2" />
                                    )}
                                </div>
                            ))}
                            {musicbrainz.recording!.recordings.length > 3 && (
                                <div className="text-xs text-muted-foreground">
                                    ... and {musicbrainz.recording!.recordings.length - 3} more recordings
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Release Information */}
                {hasReleaseData && (
                    <>
                        {hasRecordingData && <Separator />}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Disc className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">Releases</span>
                            </div>
                            <div className="space-y-4 pl-6">
                                {musicbrainz.release!.releases.slice(0, 3).map((release, index) => (
                                    <div key={release.id} className="space-y-2">
                                        <div className="grid gap-1 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Title</span>
                                                <span className="font-medium">{release.title}</span>
                                            </div>
                                            {release.status && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Status</span>
                                                    <Badge variant="outline" className="text-xs">
                                                        {release.status}
                                                    </Badge>
                                                </div>
                                            )}
                                            {release.date && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Date</span>
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        <span>{release.date}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {release.country && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Country</span>
                                                    <div className="flex items-center gap-1">
                                                        <MapPin className="h-3 w-3" />
                                                        <span>{release.country}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {release.score && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Match Score</span>
                                                    <Badge
                                                        variant={release.score === 100 ? 'default' : 'secondary'}
                                                        className="text-xs"
                                                    >
                                                        {release.score}%
                                                    </Badge>
                                                </div>
                                            )}
                                            {release['artist-credit'] && release['artist-credit'].length > 0 && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Artist</span>
                                                    <span className="text-sm">
                                                        {release['artist-credit'].map((ac) => ac.name).join(' & ')}
                                                    </span>
                                                </div>
                                            )}
                                            {release['release-group'] && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Type</span>
                                                    <div className="flex gap-1">
                                                        <Badge variant="secondary" className="text-xs">
                                                            {release['release-group']['primary-type']}
                                                        </Badge>
                                                        {release['release-group']['secondary-types']?.map((type) => (
                                                            <Badge key={type} variant="outline" className="text-xs">
                                                                {type}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {release['label-info'] && release['label-info'].length > 0 && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Label</span>
                                                    <span className="text-sm">
                                                        {release['label-info'][0].label.name}
                                                        {release['label-info'][0]['catalog-number'] &&
                                                            ` (${release['label-info'][0]['catalog-number']})`}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">MBID</span>
                                                <a
                                                    href={`https://musicbrainz.org/release/${release.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                                                >
                                                    {release.id.slice(0, 8)}...
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            </div>
                                        </div>
                                        {index < Math.min(musicbrainz.release!.releases.length, 3) - 1 && (
                                            <Separator className="my-2" />
                                        )}
                                    </div>
                                ))}
                                {musicbrainz.release!.releases.length > 3 && (
                                    <div className="text-xs text-muted-foreground">
                                        ... and {musicbrainz.release!.releases.length - 3} more releases
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
