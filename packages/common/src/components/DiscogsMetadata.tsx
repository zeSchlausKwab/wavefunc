import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { Separator } from '@wavefunc/ui/components/ui/separator'
import { cn } from '@wavefunc/common'
import { ExternalLink, Users, Calendar, MapPin, Disc, Tag } from 'lucide-react'
import type { RecognitionResult } from '@wavefunc/common/src/types/recognition'

interface DiscogsMetadataProps {
    result: RecognitionResult
    className?: string
}

export function DiscogsMetadata({ result, className }: DiscogsMetadataProps) {
    const { discogs } = result

    if (!discogs) {
        return null
    }

    const formatPrice = (price?: number) => {
        if (!price) return null
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(price)
    }

    return (
        <Card className={cn('w-full', className)}>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Disc className="h-5 w-5" />
                    Discogs Information
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Release Images */}
                {discogs.images && discogs.images.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto">
                        {discogs.images.slice(0, 3).map((image, index) => (
                            <div
                                key={index}
                                className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md"
                            >
                                <img
                                    src={image.uri150}
                                    alt={`${discogs.title} - Image ${index + 1}`}
                                    className="h-full w-full object-cover"
                                />
                                {image.type === 'primary' && (
                                    <Badge
                                        variant="secondary"
                                        className="absolute bottom-1 left-1 px-1 py-0 text-xs"
                                    >
                                        Primary
                                    </Badge>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Basic Information */}
                <div className="grid gap-2 text-sm">
                    {discogs.year && (
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                Year
                            </span>
                            <span className="font-medium">{discogs.year}</span>
                        </div>
                    )}
                    
                    {discogs.country && (
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="h-4 w-4" />
                                Country
                            </span>
                            <span className="font-medium">{discogs.country}</span>
                        </div>
                    )}

                    {discogs.community && (
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-muted-foreground">
                                <Users className="h-4 w-4" />
                                Community
                            </span>
                            <div className="flex gap-3 text-xs">
                                <span>{discogs.community.in_collection} in collection</span>
                                <span>{discogs.community.in_wantlist} want</span>
                            </div>
                        </div>
                    )}

                    {discogs.lowest_price && (
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Lowest Price</span>
                            <span className="font-medium text-green-600">
                                {formatPrice(discogs.lowest_price)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Genres and Styles */}
                {(discogs.genres?.length || discogs.styles?.length) && (
                    <>
                        <Separator />
                        <div className="space-y-2">
                            {discogs.genres && discogs.genres.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                                        <Tag className="h-4 w-4" />
                                        Genres
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {discogs.genres.map((genre) => (
                                            <Badge key={genre} variant="secondary" className="text-xs">
                                                {genre}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {discogs.styles && discogs.styles.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                                        <Tag className="h-4 w-4" />
                                        Styles
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {discogs.styles.map((style) => (
                                            <Badge key={style} variant="outline" className="text-xs">
                                                {style}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Labels and Formats */}
                {(discogs.labels?.length || discogs.formats?.length) && (
                    <>
                        <Separator />
                        <div className="space-y-3 text-sm">
                            {discogs.labels && discogs.labels.length > 0 && (
                                <div>
                                    <div className="font-medium text-muted-foreground mb-1">Labels</div>
                                    <div className="space-y-1">
                                        {discogs.labels.map((label, index) => (
                                            <div key={index} className="flex justify-between">
                                                <span>{label.name}</span>
                                                {label.catno && (
                                                    <span className="text-muted-foreground font-mono text-xs">
                                                        {label.catno}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {discogs.formats && discogs.formats.length > 0 && (
                                <div>
                                    <div className="font-medium text-muted-foreground mb-1">Formats</div>
                                    <div className="flex flex-wrap gap-1">
                                        {discogs.formats.map((format, index) => (
                                            <Badge key={index} variant="outline" className="text-xs">
                                                {format.name}
                                                {format.descriptions && format.descriptions.length > 0 && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        ({format.descriptions.join(', ')})
                                                    </span>
                                                )}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Discogs Link */}
                {discogs.uri && (
                    <>
                        <Separator />
                        <a
                            href={discogs.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                'inline-flex items-center justify-center gap-2 w-full',
                                'rounded-md bg-[#333333] px-3 py-2 text-sm font-semibold text-white',
                                'hover:bg-[#333333]/90 transition-colors'
                            )}
                        >
                            View on Discogs <ExternalLink className="h-4 w-4" />
                        </a>
                    </>
                )}
            </CardContent>
        </Card>
    )
}