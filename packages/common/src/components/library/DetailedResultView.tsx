import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Separator } from '@wavefunc/ui/components/ui/separator'
import { Calendar, Clock, Disc, ExternalLink, Eye, Music, Tag as TagIcon, ThumbsUp, Users } from 'lucide-react'
import type { SearchResult, SearchType, YouTubeVideo, YouTubeVideoDetails } from './types'
import { formatDuration, getBestThumbnailUrl } from './utils'

interface DetailedResultViewProps {
    result: SearchResult | YouTubeVideoDetails
    searchType: SearchType
}

export function DetailedResultView({ result, searchType }: DetailedResultViewProps) {
    const isYouTubeResult = searchType === 'youtube'
    const youtubeResult = isYouTubeResult ? (result as YouTubeVideo | YouTubeVideoDetails) : null

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
        if ('cover_image' in result && result.cover_image) return result.cover_image
        if ('thumb' in result && result.thumb) return result.thumb
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

    const getVideoId = () => {
        if (isYouTubeResult && result.id) {
            return result.id
        }
        if (isYouTubeResult && youtubeResult?.url) {
            const match = youtubeResult.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)
            return match ? match[1] : null
        }
        return null
    }

    const coverImage = getCoverImage()
    const artistName = getArtistName()
    const externalUrl = getExternalUrl()
    const videoId = getVideoId()

    return (
        <div className="space-y-6">
            {/* YouTube Video Embed */}
            {isYouTubeResult && videoId && (
                <div className="w-full">
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted shadow-sm">
                        <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title={result.title || 'YouTube Video'}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="absolute inset-0 w-full h-full"
                            loading="lazy"
                        />
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className="flex items-start gap-6">
                {!isYouTubeResult && coverImage && (
                    <img
                        src={coverImage}
                        alt={result.title || 'Cover'}
                        className="w-48 h-48 object-cover rounded-lg flex-shrink-0"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none'
                        }}
                    />
                )}
                <div className="flex-1 space-y-4">
                    <div>
                        <h1 className="text-3xl font-bold">{result.title || 'Untitled'}</h1>
                        {artistName && <p className="text-xl text-muted-foreground mt-2">{artistName}</p>}
                        {result.disambiguation && (
                            <p className="text-sm text-orange-600 italic mt-1">{result.disambiguation}</p>
                        )}
                        {isYouTubeResult && 'description' in result && result.description && (
                            <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{result.description}</p>
                        )}
                    </div>

                    {/* Basic Info Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        {result.id && (
                            <div>
                                <Label className="font-semibold">ID</Label>
                                <p className="text-sm font-mono break-all">{result.id}</p>
                            </div>
                        )}
                        {isYouTubeResult && 'viewCount' in result && result.viewCount && (
                            <div>
                                <Label className="font-semibold">View Count</Label>
                                <p className="flex items-center gap-1">
                                    <Eye className="w-4 h-4" />
                                    {typeof result.viewCount === 'string'
                                        ? result.viewCount
                                        : result.viewCount.toLocaleString()}
                                </p>
                            </div>
                        )}
                        {isYouTubeResult && 'likeCount' in result && result.likeCount && (
                            <div>
                                <Label className="font-semibold">Like Count</Label>
                                <p className="flex items-center gap-1">
                                    <ThumbsUp className="w-4 h-4" />
                                    {typeof result.likeCount === 'string'
                                        ? result.likeCount
                                        : result.likeCount.toLocaleString()}
                                </p>
                            </div>
                        )}
                        {isYouTubeResult && 'publishDate' in result && result.publishDate && (
                            <div>
                                <Label className="font-semibold">Published</Label>
                                <p>{result.publishDate}</p>
                            </div>
                        )}
                        {isYouTubeResult && 'category' in result && result.category && (
                            <div>
                                <Label className="font-semibold">Category</Label>
                                <Badge>{result.category}</Badge>
                            </div>
                        )}
                        {'date' in result && result.date && (
                            <div>
                                <Label className="font-semibold">Release Date</Label>
                                <p>{result.date}</p>
                            </div>
                        )}
                        {'year' in result && result.year && (
                            <div>
                                <Label className="font-semibold">Year</Label>
                                <p>{result.year}</p>
                            </div>
                        )}
                        {'country' in result && result.country && (
                            <div>
                                <Label className="font-semibold">Country</Label>
                                <p>{result.country}</p>
                            </div>
                        )}
                        {'length' in result && result.length && (
                            <div>
                                <Label className="font-semibold">Duration</Label>
                                <p>{formatDuration(result.length)}</p>
                            </div>
                        )}
                        {isYouTubeResult && 'duration' in result && result.duration && (
                            <div>
                                <Label className="font-semibold">Duration</Label>
                                <p>{typeof result.duration === 'string' ? result.duration : `${result.duration}s`}</p>
                            </div>
                        )}
                        {'status' in result && result.status && (
                            <div>
                                <Label className="font-semibold">Status</Label>
                                <Badge>{result.status}</Badge>
                            </div>
                        )}
                        {'type' in result && result.type && (
                            <div>
                                <Label className="font-semibold">Type</Label>
                                <Badge variant="outline">{result.type}</Badge>
                            </div>
                        )}
                        {'barcode' in result && result.barcode && (
                            <div>
                                <Label className="font-semibold">Barcode</Label>
                                <p className="font-mono text-sm">{result.barcode}</p>
                            </div>
                        )}
                    </div>

                    {/* External Link */}
                    {externalUrl && (
                        <Button variant="outline" onClick={() => window.open(externalUrl, '_blank')}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            {isYouTubeResult
                                ? 'Watch on YouTube'
                                : `View on ${searchType === 'discogs' ? 'Discogs' : 'MusicBrainz'}`}
                        </Button>
                    )}
                </div>
            </div>

            {/* YouTube Tags */}
            {isYouTubeResult && 'tags' in result && result.tags && result.tags.length > 0 && (
                <>
                    <Separator />
                    <div>
                        <Label className="font-semibold text-base">Tags</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {result.tags.map((tag, i) => (
                                <Badge key={i} variant="secondary">
                                    <TagIcon className="w-3 h-3 mr-1" />
                                    {typeof tag === 'string' ? tag : tag.name || 'Unknown'}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Genre and Style Tags */}
            {'genre' in result && (result.genre || result.style) && (
                <>
                    <Separator />
                    <div>
                        <Label className="font-semibold text-base">Genres & Styles</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {result.genre?.map((g, i) => (
                                <Badge key={i} variant="secondary">
                                    <TagIcon className="w-3 h-3 mr-1" />
                                    {g}
                                </Badge>
                            ))}
                            {result.style?.map((s, i) => (
                                <Badge key={i} variant="outline">
                                    <TagIcon className="w-3 h-3 mr-1" />
                                    {s}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Community Stats (Discogs) */}
            {'community' in result && result.community && (
                <>
                    <Separator />
                    <div>
                        <Label className="font-semibold text-base">Community Stats</Label>
                        <div className="flex flex-wrap gap-4 mt-2">
                            <Badge variant="outline">
                                <Users className="w-3 h-3 mr-1" />
                                {result.community.have || 0} have
                            </Badge>
                            <Badge variant="outline">
                                <Users className="w-3 h-3 mr-1" />
                                {result.community.want || 0} want
                            </Badge>
                            {'rating' in result.community && result.community.rating && (
                                <Badge variant="outline">
                                    ⭐ {result.community.rating.average.toFixed(1)} ({result.community.rating.count}{' '}
                                    ratings)
                                </Badge>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Labels */}
            {'label' in result && result.label && result.label.length > 0 && (
                <>
                    <Separator />
                    <div>
                        <Label className="font-semibold text-base">Labels</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {result.label.map((label, i) => (
                                <Badge key={i} variant="outline">
                                    {label}
                                    {'catno' in result && result.catno && ` - ${result.catno}`}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Formats */}
            {'format' in result && result.format && result.format.length > 0 && (
                <>
                    <Separator />
                    <div>
                        <Label className="font-semibold text-base">Formats</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {result.format.map((format, i) => (
                                <Badge key={i} variant="outline">
                                    <Disc className="w-3 h-3 mr-1" />
                                    {format}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* MusicBrainz Specific - Tags */}
            {'tags' in result && result.tags && result.tags.length > 0 && !isYouTubeResult && (
                <>
                    <Separator />
                    <div>
                        <Label className="font-semibold text-base">Tags</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {result.tags.slice(0, 10).map((tag, i) => (
                                <Badge key={i} variant="secondary">
                                    <TagIcon className="w-3 h-3 mr-1" />
                                    {typeof tag === 'string' ? tag : `${(tag as any).name} (${(tag as any).count})`}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* MusicBrainz Specific - Media Info */}
            {'media' in result && result.media && result.media.length > 0 && (
                <>
                    <Separator />
                    <div>
                        <Label className="font-semibold text-base">Media</Label>
                        <div className="space-y-2 mt-2">
                            {result.media.map((medium, i) => (
                                <div key={i} className="p-3 bg-muted rounded">
                                    <div className="flex items-center gap-4 text-sm">
                                        <Badge variant="outline">
                                            <Disc className="w-3 h-3 mr-1" />
                                            {medium.format || 'Unknown Format'}
                                        </Badge>
                                        {medium['track-count'] && (
                                            <Badge variant="outline">
                                                <Music className="w-3 h-3 mr-1" />
                                                {medium['track-count']} tracks
                                            </Badge>
                                        )}
                                        {medium.title && <span className="font-medium">{medium.title}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Artist Specific - Life Span */}
            {'life-span' in result && result['life-span'] && (
                <>
                    <Separator />
                    <div>
                        <Label className="font-semibold text-base">Life Span</Label>
                        <div className="flex gap-4 mt-2 text-sm">
                            {result['life-span'].begin && (
                                <Badge variant="outline">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    Born: {result['life-span'].begin}
                                </Badge>
                            )}
                            {result['life-span'].end && (
                                <Badge variant="outline">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    Died: {result['life-span'].end}
                                </Badge>
                            )}
                            {result['life-span'].ended === false && (
                                <Badge variant="secondary">
                                    <Clock className="w-3 h-3 mr-1" />
                                    Active
                                </Badge>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
