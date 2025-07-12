import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Card, CardContent } from '@wavefunc/ui/components/ui/card'
import { Calendar, Clock, ExternalLink, Eye, Hash, MapPin, Play } from 'lucide-react'
import type { SearchResult, SearchType, YouTubeVideo } from './types'
import { formatDuration, getBestThumbnailUrl } from './utils'

interface SearchResultCardProps {
    result: SearchResult
    searchType: SearchType
    onViewDetails: (result: SearchResult) => void
    onDetailedLookup: (id: string) => void
}

export function SearchResultCard({ result, searchType, onViewDetails, onDetailedLookup }: SearchResultCardProps) {
    const isYouTubeResult = searchType === 'youtube'
    const youtubeResult = isYouTubeResult ? (result as YouTubeVideo) : null

    const getArtistName = () => {
        if (isYouTubeResult && youtubeResult?.channelTitle) {
            return youtubeResult.channelTitle
        }
        if ('artist-credit' in result && result['artist-credit']) {
            return result['artist-credit'].map((ac) => ac.name || ac.artist?.name).join(', ')
        }
        if ('artist' in result && result.artist) {
            return result.artist
        }
        if ('name' in result && result.name) {
            return result.name
        }
        return null
    }

    const getCoverImage = () => {
        if (isYouTubeResult && youtubeResult?.thumbnail) return getBestThumbnailUrl(youtubeResult.thumbnail)
        if ('thumb' in result && result.thumb) return result.thumb
        if ('cover_image' in result && result.cover_image) return result.cover_image
        return null
    }

    const getYear = () => {
        if ('year' in result && result.year) return result.year
        if ('date' in result && result.date) {
            const year = new Date(result.date).getFullYear()
            return isNaN(year) ? null : year
        }
        return null
    }

    const getExternalUrl = () => {
        if (isYouTubeResult && youtubeResult?.url) {
            return youtubeResult.url
        }
        if (searchType === 'discogs' && 'uri' in result && result.uri) {
            return `https://www.discogs.com${result.uri}`
        }
        if (result.id) {
            return `https://musicbrainz.org/${searchType}/${result.id}`
        }
        return null
    }

    const getDescription = () => {
        if (isYouTubeResult && youtubeResult?.description) {
            return youtubeResult.description.length > 150
                ? youtubeResult.description.slice(0, 150) + '...'
                : youtubeResult.description
        }
        return null
    }

    const coverImage = getCoverImage()
    const artistName = getArtistName()
    const year = getYear()
    const externalUrl = getExternalUrl()
    const description = getDescription()

    return (
        <Card className="mb-4 hover:shadow-md transition-shadow">
            <CardContent className="p-4">
                <div className="flex items-start gap-4">
                    {coverImage && (
                        <div className="relative flex-shrink-0">
                            <img
                                src={coverImage}
                                alt={result.title || 'Cover'}
                                className="w-16 h-16 object-cover rounded"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                }}
                            />
                            {isYouTubeResult && youtubeResult?.type === 'video' && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Play className="w-6 h-6 text-white drop-shadow-lg" />
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex-1 space-y-2 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-lg truncate" title={result.title}>
                                {result.title || 'Untitled'}
                            </h3>
                            <div className="flex gap-1">
                                {result.score && <Badge variant="secondary">Score: {result.score}%</Badge>}
                                {isYouTubeResult && youtubeResult?.type && (
                                    <Badge variant="outline">{youtubeResult.type}</Badge>
                                )}
                            </div>
                        </div>

                        {artistName && (
                            <p className="text-muted-foreground truncate" title={artistName}>
                                {artistName}
                            </p>
                        )}

                        {description && (
                            <p className="text-sm text-muted-foreground" title={youtubeResult?.description}>
                                {description}
                            </p>
                        )}

                        <div className="flex flex-wrap gap-2 text-sm">
                            {result.id && (
                                <Badge variant="outline" title={result.id}>
                                    <Hash className="w-3 h-3 mr-1" />
                                    {result.id.slice(0, 8)}...
                                </Badge>
                            )}
                            {year && (
                                <Badge variant="outline">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    {year}
                                </Badge>
                            )}
                            {'country' in result && result.country && (
                                <Badge variant="outline">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    {result.country}
                                </Badge>
                            )}
                            {'length' in result && result.length && (
                                <Badge variant="outline">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {formatDuration(result.length)}
                                </Badge>
                            )}
                            {isYouTubeResult && youtubeResult?.duration && (
                                <Badge variant="outline">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {youtubeResult.duration}
                                </Badge>
                            )}
                            {isYouTubeResult && youtubeResult?.viewCount && (
                                <Badge variant="outline">
                                    <Eye className="w-3 h-3 mr-1" />
                                    {youtubeResult.viewCount}
                                </Badge>
                            )}
                            {isYouTubeResult && youtubeResult?.publishedTime && (
                                <Badge variant="outline">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    {youtubeResult.publishedTime}
                                </Badge>
                            )}
                        </div>

                        {result.disambiguation && (
                            <p className="text-sm text-orange-600 italic truncate" title={result.disambiguation}>
                                {result.disambiguation}
                            </p>
                        )}

                        <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={() => onViewDetails(result)}>
                                View Details
                            </Button>
                            {result.id && (
                                <Button size="sm" variant="outline" onClick={() => onDetailedLookup(result.id!)}>
                                    {isYouTubeResult ? 'Video Details' : 'Detailed Lookup'}
                                </Button>
                            )}
                            {externalUrl && (
                                <Button size="sm" variant="outline" onClick={() => window.open(externalUrl, '_blank')}>
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    {isYouTubeResult ? 'Watch' : 'Open'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
