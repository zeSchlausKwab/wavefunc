import { Button } from '@wavefunc/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wavefunc/ui/components/ui/select'
import { Album, Disc, Loader2, Music, Search, Tag, Users, Video } from 'lucide-react'
import type { SearchFormData, SearchType } from './types'

interface SearchFormProps {
    searchType: SearchType
    formData: SearchFormData
    isLoading: boolean
    onSearchTypeChange: (type: SearchType) => void
    onFormDataChange: (data: Partial<SearchFormData>) => void
    onSubmit: () => void
    getToolCost: (toolName: string) => string
}

export function SearchForm({
    searchType,
    formData,
    isLoading,
    onSearchTypeChange,
    onFormDataChange,
    onSubmit,
    getToolCost,
}: SearchFormProps) {
    const searchTypes: { type: SearchType; label: string; icon: any }[] = [
        { type: 'recording', label: 'Recordings', icon: Music },
        { type: 'release', label: 'Releases', icon: Album },
        { type: 'artist', label: 'Artists', icon: Users },
        { type: 'label', label: 'Labels', icon: Tag },
        { type: 'discogs', label: 'Discogs', icon: Disc },
        { type: 'youtube', label: 'YouTube', icon: Video },
    ]

    const getToolName = () => {
        switch (searchType) {
            case 'discogs':
                return 'discogs-search'
            case 'youtube':
                return 'youtube-search'
            case 'recording':
                return 'musicbrainz-search-recording'
            case 'artist':
                return 'musicbrainz-search-artist'
            case 'label':
                return 'musicbrainz-search-label'
            default:
                return 'musicbrainz-search-release'
        }
    }

    const isFormValid = () => {
        if (searchType === 'youtube') {
            return !!(formData.query?.trim() || formData.artist?.trim() || formData.title?.trim())
        }
        if (!formData.artist.trim()) return false
        if (searchType !== 'artist' && searchType !== 'label' && !formData.title.trim()) return false
        return true
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Search className="w-5 h-5" />
                    Search Music Metadata
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Search Type Selector */}
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mb-4">
                    {searchTypes.map(({ type, label, icon: Icon }) => (
                        <Button
                            key={type}
                            variant={searchType === type ? 'default' : 'outline'}
                            onClick={() => onSearchTypeChange(type)}
                            className="flex items-center gap-2"
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </Button>
                    ))}
                </div>

                {/* YouTube Search Fields */}
                {searchType === 'youtube' ? (
                    <>
                        <div>
                            <Label htmlFor="query">Search Query *</Label>
                            <Input
                                id="query"
                                value={formData.query || ''}
                                onChange={(e) => onFormDataChange({ query: e.target.value })}
                                placeholder="Enter search query (e.g., 'artist song name' or 'music video')"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="youtubeType">Content Type</Label>
                                <Select
                                    value={formData.youtubeType || 'video'}
                                    onValueChange={(value) => onFormDataChange({ youtubeType: value as any })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select content type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="video">Videos</SelectItem>
                                        <SelectItem value="channel">Channels</SelectItem>
                                        <SelectItem value="playlist">Playlists</SelectItem>
                                        <SelectItem value="all">All</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="limit">Results Limit</Label>
                                <Input
                                    id="limit"
                                    value={formData.limit || ''}
                                    onChange={(e) => onFormDataChange({ limit: e.target.value })}
                                    placeholder="10"
                                    type="number"
                                    min="1"
                                    max="50"
                                />
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Main Search Fields for other types */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="artist">
                                    {searchType === 'artist'
                                        ? 'Artist Name'
                                        : searchType === 'label'
                                          ? 'Label Name'
                                          : 'Artist'}{' '}
                                    *
                                </Label>
                                <Input
                                    id="artist"
                                    value={formData.artist}
                                    onChange={(e) => onFormDataChange({ artist: e.target.value })}
                                    placeholder={
                                        searchType === 'artist'
                                            ? 'Enter artist name'
                                            : searchType === 'label'
                                              ? 'Enter label name'
                                              : 'Enter artist name'
                                    }
                                />
                            </div>
                            {searchType !== 'artist' && searchType !== 'label' && (
                                <div>
                                    <Label htmlFor="title">Title *</Label>
                                    <Input
                                        id="title"
                                        value={formData.title}
                                        onChange={(e) => onFormDataChange({ title: e.target.value })}
                                        placeholder="Enter song/release title"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Advanced Options */}
                        <div className="grid grid-cols-2 gap-4">
                            {searchType === 'discogs' ? (
                                <>
                                    <div>
                                        <Label htmlFor="type">Type</Label>
                                        <Input
                                            id="type"
                                            value={formData.type || ''}
                                            onChange={(e) => onFormDataChange({ type: e.target.value })}
                                            placeholder="release, master, artist, label"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="per_page">Results per page</Label>
                                        <Input
                                            id="per_page"
                                            value={formData.per_page || ''}
                                            onChange={(e) => onFormDataChange({ per_page: e.target.value })}
                                            placeholder="10"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <Label htmlFor="limit">Limit</Label>
                                        <Input
                                            id="limit"
                                            value={formData.limit || ''}
                                            onChange={(e) => onFormDataChange({ limit: e.target.value })}
                                            placeholder="10"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="offset">Offset</Label>
                                        <Input
                                            id="offset"
                                            value={formData.offset || ''}
                                            onChange={(e) => onFormDataChange({ offset: e.target.value })}
                                            placeholder="0"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                )}

                {/* Submit Button */}
                <Button onClick={onSubmit} disabled={isLoading || !isFormValid()} className="w-full">
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Searching...
                        </>
                    ) : (
                        <>
                            <Search className="w-4 h-4 mr-2" />
                            Search ({getToolCost(getToolName())})
                        </>
                    )}
                </Button>
            </CardContent>
        </Card>
    )
}
