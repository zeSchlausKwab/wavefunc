import { useState } from 'react'
import { createDVMCPService } from '../services/dvmcp'
import { ndkActions } from '../lib/store/ndk'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Textarea } from '@wavefunc/ui/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wavefunc/ui/components/ui/tabs'
import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Separator } from '@wavefunc/ui/components/ui/separator'
import { ScrollArea } from '@wavefunc/ui/components/ui/scroll-area'
import {
    Search,
    Music,
    Disc,
    ExternalLink,
    Loader2,
    Album,
    Headphones,
    Database,
    Globe,
    Hash,
    Calendar,
    MapPin,
    Tag,
    Users,
    Clock,
} from 'lucide-react'
import { toast } from 'sonner'

interface SearchFormData {
    artist: string
    title: string
    type?: string
    limit?: string
    offset?: string
    page?: string
    per_page?: string
    status?: string
}

interface SearchResult {
    id?: string
    title?: string
    artist?: string
    score?: number
    disambiguation?: string
    'artist-credit'?: any[]
    releases?: any[]
    'release-groups'?: any[]
    country?: string
    year?: number
    genre?: string[]
    style?: string[]
    label?: string[]
    catno?: string
    format?: string[]
    thumb?: string
    cover_image?: string
    uri?: string
    community?: {
        want?: number
        have?: number
    }
    // MusicBrainz specific
    length?: number
    status?: string
    date?: string
    barcode?: string
    'text-representation'?: {
        language?: string
        script?: string
    }
    'label-info'?: any[]
    media?: any[]
    'cover-art-archive'?: {
        artwork?: boolean
        count?: number
        front?: boolean
        back?: boolean
    }
}

interface ToolResult {
    tool: string
    data: any
    timestamp: number
    cost?: string
}

export function LibraryContainer() {
    const [activeTab, setActiveTab] = useState('search')
    const [searchType, setSearchType] = useState<'recording' | 'release' | 'artist' | 'label' | 'discogs'>('recording')
    const [formData, setFormData] = useState<SearchFormData>({
        artist: '',
        title: '',
        type: 'release',
        limit: '10',
        offset: '0',
        page: '1',
        per_page: '10',
    })
    const [lookupId, setLookupId] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [results, setResults] = useState<SearchResult[]>([])
    const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
    const [toolHistory, setToolHistory] = useState<ToolResult[]>([])

    const callDVMCPTool = async (toolName: string, args: Record<string, any>) => {
        const ndk = ndkActions.getNDK()
        if (!ndk) {
            toast.error('NDK not available')
            return null
        }

        setIsLoading(true)
        try {
            const dvmcpService = createDVMCPService(ndk)
            const result = await dvmcpService.callTool(toolName, args)

            // Debug: Log the raw result to see the structure
            console.log(`[LibraryContainer] Raw result from ${toolName}:`, result)

            const toolResult: ToolResult = {
                tool: toolName,
                data: result,
                timestamp: Date.now(),
                cost: getToolCost(toolName),
            }

            setToolHistory((prev) => [toolResult, ...prev.slice(0, 9)]) // Keep last 10
            toast.success(`${toolName} completed successfully!`)
            return result
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            toast.error(`${toolName} failed: ${errorMessage}`)
            return null
        } finally {
            setIsLoading(false)
        }
    }

    const getToolCost = (toolName: string): string => {
        const costs: Record<string, string> = {
            'music-recognition': 'Free',
            'discogs-search': 'Free',
            'discogs-release': '3 sats',
            'musicbrainz-search-recording': '1 sat',
            'musicbrainz-search-release': '1 sat',
            'musicbrainz-search-artist': '1 sat',
            'musicbrainz-search-label': '1 sat',
            'musicbrainz-get-recording': '2 sats',
            'musicbrainz-get-release': '2 sats',
            'musicbrainz-get-artist': '2 sats',
            'musicbrainz-get-label': '2 sats',
            'radio-search': '3 sats',
        }
        return costs[toolName] || 'Unknown'
    }

    const handleSearch = async () => {
        // For artist and label searches, only need the name field
        if (searchType === 'artist' || searchType === 'label') {
            if (!formData.artist.trim()) {
                toast.error(`Please enter a ${searchType} name`)
                return
            }
        } else {
            if (!formData.artist.trim() || !formData.title.trim()) {
                toast.error('Please enter both artist and title')
                return
            }
        }

        let toolName: string
        let args: Record<string, any>

        if (searchType === 'discogs') {
            toolName = 'discogs-search'
            args = {
                artist: formData.artist,
                title: formData.title,
                type: formData.type || 'release',
                per_page: formData.per_page || '10',
                page: formData.page || '1',
            }
        } else if (searchType === 'recording') {
            toolName = 'musicbrainz-search-recording'
            args = {
                artist: formData.artist,
                title: formData.title,
                limit: formData.limit || '10',
                offset: formData.offset || '0',
            }
        } else if (searchType === 'artist') {
            toolName = 'musicbrainz-search-artist'
            args = {
                name: formData.artist,
                limit: formData.limit || '10',
                offset: formData.offset || '0',
            }
        } else if (searchType === 'label') {
            toolName = 'musicbrainz-search-label'
            args = {
                name: formData.artist, // Using artist field for the label name
                limit: formData.limit || '10',
                offset: formData.offset || '0',
            }
        } else {
            toolName = 'musicbrainz-search-release'
            args = {
                artist: formData.artist,
                title: formData.title,
                limit: formData.limit || '10',
                offset: formData.offset || '0',
                ...(formData.type && { type: formData.type }),
                ...(formData.status && { status: formData.status }),
            }
        }

        const result = await callDVMCPTool(toolName, args)
        if (result) {
            console.log(`[LibraryContainer] Processing result for ${searchType}:`, result)

            // The DVMCP service returns data in different formats, let's handle all possible structures
            let resultData = result

            // If result has a 'data' property, unwrap it
            if (result.data) {
                resultData = result.data
            }

            // Try to extract the actual search results based on search type
            if (searchType === 'discogs') {
                if (resultData.results) {
                    setResults(resultData.results)
                } else if (Array.isArray(resultData)) {
                    setResults(resultData)
                } else {
                    console.log('[LibraryContainer] No discogs results found in:', resultData)
                    setResults([])
                }
            } else if (searchType === 'recording') {
                if (resultData.recordings) {
                    setResults(resultData.recordings)
                } else if (Array.isArray(resultData)) {
                    setResults(resultData)
                } else {
                    console.log('[LibraryContainer] No recording results found in:', resultData)
                    setResults([])
                }
            } else if (searchType === 'release') {
                if (resultData.releases) {
                    setResults(resultData.releases)
                } else if (Array.isArray(resultData)) {
                    setResults(resultData)
                } else {
                    console.log('[LibraryContainer] No release results found in:', resultData)
                    setResults([])
                }
            } else if (searchType === 'artist') {
                if (resultData.artists) {
                    setResults(resultData.artists)
                } else if (Array.isArray(resultData)) {
                    setResults(resultData)
                } else {
                    console.log('[LibraryContainer] No artist results found in:', resultData)
                    setResults([])
                }
            } else if (searchType === 'label') {
                if (resultData.labels) {
                    setResults(resultData.labels)
                } else if (Array.isArray(resultData)) {
                    setResults(resultData)
                } else {
                    console.log('[LibraryContainer] No label results found in:', resultData)
                    setResults([])
                }
            } else {
                console.log('[LibraryContainer] Unknown search type or no results found:', searchType, resultData)
                setResults([])
            }
        } else {
            console.log('[LibraryContainer] No result returned from DVMCP')
            setResults([])
        }
    }

    const handleLookup = async () => {
        if (!lookupId.trim()) {
            toast.error('Please enter an ID')
            return
        }

        let toolName: string
        let args: Record<string, any>

        if (searchType === 'discogs') {
            toolName = 'discogs-release'
            args = { releaseId: lookupId }
        } else if (searchType === 'recording') {
            toolName = 'musicbrainz-get-recording'
            args = {
                recordingId: lookupId,
                inc: 'artists,releases,artist-credits',
            }
        } else if (searchType === 'artist') {
            toolName = 'musicbrainz-get-artist'
            args = {
                artistId: lookupId,
                inc: 'releases,recordings,release-groups,works',
            }
        } else if (searchType === 'label') {
            toolName = 'musicbrainz-get-label'
            args = {
                labelId: lookupId,
                inc: 'releases,artists',
            }
        } else {
            toolName = 'musicbrainz-get-release'
            args = {
                releaseId: lookupId,
                inc: 'artists,recordings,release-groups,labels,media,cover-art-archive',
            }
        }

        const result = await callDVMCPTool(toolName, args)
        if (result) {
            setSelectedResult(result)
            setActiveTab('details')
        }
    }

    const formatDuration = (ms?: number) => {
        if (!ms) return null
        const minutes = Math.floor(ms / 60000)
        const seconds = ((ms % 60000) / 1000).toFixed(0)
        return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`
    }

    const renderSearchResult = (result: SearchResult, index: number) => (
        <Card key={index} className="mb-4">
            <CardContent className="p-4">
                <div className="flex items-start gap-4">
                    {result.thumb && (
                        <img src={result.thumb} alt={result.title} className="w-16 h-16 object-cover rounded" />
                    )}
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-lg">{result.title}</h3>
                            {result.score && <Badge variant="secondary">Score: {result.score}%</Badge>}
                        </div>

                        {result['artist-credit'] ? (
                            <p className="text-muted-foreground">
                                {result['artist-credit'].map((ac: any) => ac.name || ac.artist?.name).join(', ')}
                            </p>
                        ) : (
                            result.artist && <p className="text-muted-foreground">{result.artist}</p>
                        )}

                        <div className="flex flex-wrap gap-2 text-sm">
                            {result.id && (
                                <Badge variant="outline">
                                    <Hash className="w-3 h-3 mr-1" />
                                    {result.id.slice(0, 8)}...
                                </Badge>
                            )}
                            {result.year && (
                                <Badge variant="outline">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    {result.year}
                                </Badge>
                            )}
                            {result.country && (
                                <Badge variant="outline">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    {result.country}
                                </Badge>
                            )}
                            {result.length && (
                                <Badge variant="outline">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {formatDuration(result.length)}
                                </Badge>
                            )}
                        </div>

                        {result.disambiguation && (
                            <p className="text-sm text-orange-600 italic">{result.disambiguation}</p>
                        )}

                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={() => {
                                    setSelectedResult(result)
                                    setActiveTab('details')
                                }}
                            >
                                View Details
                            </Button>
                            {result.id && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setLookupId(result.id!)
                                        handleLookup()
                                    }}
                                >
                                    Detailed Lookup
                                </Button>
                            )}
                            {result.uri && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        window.open(
                                            searchType === 'discogs'
                                                ? `https://www.discogs.com${result.uri}`
                                                : `https://musicbrainz.org/${searchType}/${result.id}`,
                                            '_blank',
                                        )
                                    }
                                >
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    Open
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )

    const renderDetailedResult = (result: SearchResult) => (
        <div className="space-y-6">
            <div className="flex items-start gap-6">
                {(result.thumb || result.cover_image) && (
                    <img
                        src={result.cover_image || result.thumb}
                        alt={result.title}
                        className="w-48 h-48 object-cover rounded-lg"
                    />
                )}
                <div className="flex-1 space-y-4">
                    <div>
                        <h1 className="text-3xl font-bold">{result.title}</h1>
                        {result['artist-credit'] ? (
                            <p className="text-xl text-muted-foreground mt-2">
                                {result['artist-credit'].map((ac: any) => ac.name || ac.artist?.name).join(', ')}
                            </p>
                        ) : (
                            result.artist && <p className="text-xl text-muted-foreground mt-2">{result.artist}</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {result.id && (
                            <div>
                                <Label className="font-semibold">ID</Label>
                                <p className="text-sm font-mono">{result.id}</p>
                            </div>
                        )}
                        {result.date && (
                            <div>
                                <Label className="font-semibold">Release Date</Label>
                                <p>{result.date}</p>
                            </div>
                        )}
                        {result.year && (
                            <div>
                                <Label className="font-semibold">Year</Label>
                                <p>{result.year}</p>
                            </div>
                        )}
                        {result.country && (
                            <div>
                                <Label className="font-semibold">Country</Label>
                                <p>{result.country}</p>
                            </div>
                        )}
                        {result.length && (
                            <div>
                                <Label className="font-semibold">Length</Label>
                                <p>{formatDuration(result.length)}</p>
                            </div>
                        )}
                        {result.status && (
                            <div>
                                <Label className="font-semibold">Status</Label>
                                <Badge>{result.status}</Badge>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {(result.genre || result.style) && (
                <div>
                    <Label className="font-semibold">Genres & Styles</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {result.genre?.map((g, i) => (
                            <Badge key={i} variant="secondary">
                                <Tag className="w-3 h-3 mr-1" />
                                {g}
                            </Badge>
                        ))}
                        {result.style?.map((s, i) => (
                            <Badge key={i} variant="outline">
                                <Tag className="w-3 h-3 mr-1" />
                                {s}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {result.community && (
                <div>
                    <Label className="font-semibold">Community</Label>
                    <div className="flex gap-4 mt-2">
                        <Badge variant="outline">
                            <Users className="w-3 h-3 mr-1" />
                            {result.community.have || 0} have
                        </Badge>
                        <Badge variant="outline">
                            <Users className="w-3 h-3 mr-1" />
                            {result.community.want || 0} want
                        </Badge>
                    </div>
                </div>
            )}

            {result.label && (
                <div>
                    <Label className="font-semibold">Labels</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {result.label.map((label, i) => (
                            <Badge key={i} variant="outline">
                                {label}
                                {result.catno && ` - ${result.catno}`}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {result.format && (
                <div>
                    <Label className="font-semibold">Formats</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {result.format.map((format, i) => (
                            <Badge key={i} variant="outline">
                                <Disc className="w-3 h-3 mr-1" />
                                {format}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold mb-2">Music Library</h1>
                <p className="text-muted-foreground text-lg">
                    Search and explore music metadata using MusicBrainz and Discogs APIs via DVMCP
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="search" className="flex items-center gap-2">
                        <Search className="w-4 h-4" />
                        Search
                    </TabsTrigger>
                    <TabsTrigger value="lookup" className="flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        Lookup
                    </TabsTrigger>
                    <TabsTrigger value="details" className="flex items-center gap-2">
                        <Album className="w-4 h-4" />
                        Details
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="search" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Search className="w-5 h-5" />
                                Search Music Metadata
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
                                <Button
                                    variant={searchType === 'recording' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('recording')}
                                    className="flex items-center gap-2"
                                >
                                    <Music className="w-4 h-4" />
                                    Recordings
                                </Button>
                                <Button
                                    variant={searchType === 'release' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('release')}
                                    className="flex items-center gap-2"
                                >
                                    <Album className="w-4 h-4" />
                                    Releases
                                </Button>
                                <Button
                                    variant={searchType === 'artist' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('artist')}
                                    className="flex items-center gap-2"
                                >
                                    <Users className="w-4 h-4" />
                                    Artists
                                </Button>
                                <Button
                                    variant={searchType === 'label' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('label')}
                                    className="flex items-center gap-2"
                                >
                                    <Tag className="w-4 h-4" />
                                    Labels
                                </Button>
                                <Button
                                    variant={searchType === 'discogs' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('discogs')}
                                    className="flex items-center gap-2"
                                >
                                    <Disc className="w-4 h-4" />
                                    Discogs
                                </Button>
                            </div>

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
                                        onChange={(e) => setFormData((prev) => ({ ...prev, artist: e.target.value }))}
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
                                            onChange={(e) =>
                                                setFormData((prev) => ({ ...prev, title: e.target.value }))
                                            }
                                            placeholder="Enter song/release title"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {searchType === 'discogs' ? (
                                    <>
                                        <div>
                                            <Label htmlFor="type">Type</Label>
                                            <Input
                                                id="type"
                                                value={formData.type}
                                                onChange={(e) =>
                                                    setFormData((prev) => ({ ...prev, type: e.target.value }))
                                                }
                                                placeholder="release, master, artist, label"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="per_page">Results per page</Label>
                                            <Input
                                                id="per_page"
                                                value={formData.per_page}
                                                onChange={(e) =>
                                                    setFormData((prev) => ({ ...prev, per_page: e.target.value }))
                                                }
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
                                                value={formData.limit}
                                                onChange={(e) =>
                                                    setFormData((prev) => ({ ...prev, limit: e.target.value }))
                                                }
                                                placeholder="10"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="offset">Offset</Label>
                                            <Input
                                                id="offset"
                                                value={formData.offset}
                                                onChange={(e) =>
                                                    setFormData((prev) => ({ ...prev, offset: e.target.value }))
                                                }
                                                placeholder="0"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            <Button
                                onClick={handleSearch}
                                disabled={
                                    isLoading ||
                                    !formData.artist.trim() ||
                                    (searchType !== 'artist' && searchType !== 'label' && !formData.title.trim())
                                }
                                className="w-full"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Searching...
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-4 h-4 mr-2" />
                                        Search (
                                        {getToolCost(
                                            searchType === 'discogs'
                                                ? 'discogs-search'
                                                : searchType === 'recording'
                                                  ? 'musicbrainz-search-recording'
                                                  : searchType === 'artist'
                                                    ? 'musicbrainz-search-artist'
                                                    : searchType === 'label'
                                                      ? 'musicbrainz-search-label'
                                                      : 'musicbrainz-search-release',
                                        )}
                                        )
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Debug: Show results state */}
                    <div className="text-xs text-muted-foreground mb-2">
                        Debug: Results count: {results.length}
                        {results.length > 0 && (
                            <details className="mt-2">
                                <summary>Show raw results data</summary>
                                <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto max-h-32">
                                    {JSON.stringify(results.slice(0, 2), null, 2)}
                                </pre>
                            </details>
                        )}
                    </div>

                    {results.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Search Results ({results.length})</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-96">{results.map(renderSearchResult)}</ScrollArea>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="lookup" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="w-5 h-5" />
                                Direct ID Lookup
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
                                <Button
                                    variant={searchType === 'recording' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('recording')}
                                    size="sm"
                                >
                                    Recording
                                </Button>
                                <Button
                                    variant={searchType === 'release' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('release')}
                                    size="sm"
                                >
                                    Release
                                </Button>
                                <Button
                                    variant={searchType === 'artist' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('artist')}
                                    size="sm"
                                >
                                    Artist
                                </Button>
                                <Button
                                    variant={searchType === 'label' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('label')}
                                    size="sm"
                                >
                                    Label
                                </Button>
                                <Button
                                    variant={searchType === 'discogs' ? 'default' : 'outline'}
                                    onClick={() => setSearchType('discogs')}
                                    size="sm"
                                >
                                    Discogs
                                </Button>
                            </div>

                            <div>
                                <Label htmlFor="lookupId">
                                    {searchType === 'discogs'
                                        ? 'Discogs Release ID'
                                        : `MusicBrainz ${searchType.charAt(0).toUpperCase() + searchType.slice(1)} ID (MBID)`}
                                </Label>
                                <Input
                                    id="lookupId"
                                    value={lookupId}
                                    onChange={(e) => setLookupId(e.target.value)}
                                    placeholder={
                                        searchType === 'discogs'
                                            ? 'e.g., 123456'
                                            : 'e.g., 5b11f4ce-a62d-471e-81fc-a69a8278c7da'
                                    }
                                />
                            </div>

                            <Button onClick={handleLookup} disabled={isLoading || !lookupId.trim()} className="w-full">
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Looking up...
                                    </>
                                ) : (
                                    <>
                                        <Database className="w-4 h-4 mr-2" />
                                        Lookup (
                                        {getToolCost(
                                            searchType === 'discogs'
                                                ? 'discogs-release'
                                                : searchType === 'recording'
                                                  ? 'musicbrainz-get-recording'
                                                  : searchType === 'artist'
                                                    ? 'musicbrainz-get-artist'
                                                    : searchType === 'label'
                                                      ? 'musicbrainz-get-label'
                                                      : 'musicbrainz-get-release',
                                        )}
                                        )
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="details">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Album className="w-5 h-5" />
                                Detailed Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {selectedResult ? (
                                renderDetailedResult(selectedResult)
                            ) : (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Album className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No item selected. Search for music or use direct lookup to view details.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="w-5 h-5" />
                                Tool Usage History
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {toolHistory.length > 0 ? (
                                <ScrollArea className="h-96">
                                    {toolHistory.map((item, index) => (
                                        <div key={index} className="border-b last:border-b-0 py-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline">{item.tool}</Badge>
                                                    <Badge variant="secondary">{item.cost}</Badge>
                                                </div>
                                                <span className="text-sm text-muted-foreground">
                                                    {new Date(item.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                            <Textarea
                                                value={JSON.stringify(item.data, null, 2)}
                                                readOnly
                                                className="h-32 text-xs font-mono"
                                            />
                                        </div>
                                    ))}
                                </ScrollArea>
                            ) : (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No tool calls yet. Start searching to see your history.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
