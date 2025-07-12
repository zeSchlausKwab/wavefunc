import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { ScrollArea } from '@wavefunc/ui/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wavefunc/ui/components/ui/tabs'
import { Textarea } from '@wavefunc/ui/components/ui/textarea'
import { Album, Clock, Database, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { getDefaultRelays, getLocalDvmcpRelay } from '../constants/relays'
import { ndkActions } from '../lib/store/ndk'
import { createDVMCPService, getDVMCPService } from '../services/dvmcp'
import { DetailedResultView } from './library/DetailedResultView'
import { LookupForm } from './library/LookupForm'
import { SearchForm } from './library/SearchForm'
import { SearchResultCard } from './library/SearchResultCard'
import type { SearchFormData, SearchResult, SearchType, ToolResult } from './library/types'
import { buildLookupArgs, buildSearchArgs, extractSearchResults, getLookupToolName, getToolName } from './library/utils'

export function LibraryContainer() {
    const [activeTab, setActiveTab] = useState('search')
    const [searchType, setSearchType] = useState<SearchType>('recording')
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
        // await ndk?.connect()
        if (!ndk) {
            toast.error('NDK not available')
            return null
        }

        console.log('[LibraryContainer] NDK connected relays:', Array.from(ndk.pool.relays.keys()))

        setIsLoading(true)
        try {
            // Get the singleton service instance instead of creating new ones
            let dvmcpService = getDVMCPService()
            if (!dvmcpService) {
                dvmcpService = createDVMCPService(ndk)
            }

            console.log('[LibraryContainer] NDK connected relays:', Array.from(ndk.pool.relays.keys()))
            console.log('[LibraryContainer] NDK explicit relay URLs:', ndk.explicitRelayUrls)

            // Only add local DVMCP relay if no default relays are configured
            const defaultRelays = getDefaultRelays()
            if (defaultRelays.length === 0) {
                const localDvmcpRelay = getLocalDvmcpRelay()
                const isLocalRelayConnected = Array.from(ndk.pool.relays.keys()).includes(localDvmcpRelay)
                console.log('[LibraryContainer] Local DVMCP relay connected:', isLocalRelayConnected)

                if (!isLocalRelayConnected) {
                    console.log('[LibraryContainer] Adding local DVMCP relay...')
                    try {
                        ndk.addExplicitRelay(localDvmcpRelay)
                        await ndk.connect()
                        console.log('[LibraryContainer] Local DVMCP relay added and connected')
                    } catch (error) {
                        console.warn('[LibraryContainer] Failed to add local DVMCP relay:', error)
                    }
                }
            } else {
                console.log('[LibraryContainer] Using default relays, skipping local DVMCP relay addition')
            }

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
        // Tool costs are determined by the DVMCP server configuration
        return 'Variable'
    }

    const handleSearch = async () => {
        // Validate form data
        if (searchType === 'youtube') {
            if (!formData.query?.trim() && !formData.artist?.trim() && !formData.title?.trim()) {
                toast.error('Please enter a search query or artist/title')
                return
            }
        } else {
            if (!formData.artist.trim()) {
                toast.error(
                    `Please enter a ${searchType === 'artist' ? 'artist' : searchType === 'label' ? 'label' : 'artist'} name`,
                )
                return
            }
            if (searchType !== 'artist' && searchType !== 'label' && !formData.title.trim()) {
                toast.error('Please enter both artist and title')
                return
            }
        }

        const toolName = getToolName(searchType)
        const args = buildSearchArgs(searchType, formData)

        console.log('[LibraryContainer] Calling DVMCP tool:', toolName, args, 'with searchType:', searchType)

        const result = await callDVMCPTool(toolName, args)

        console.log('[LibraryContainer] Result:', result)
        if (result) {
            console.log(`[LibraryContainer] Processing result for ${searchType}:`, result)
            const extractedResults = extractSearchResults(result, searchType)
            setResults(extractedResults)
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

        const toolName = getLookupToolName(searchType)
        const args = buildLookupArgs(searchType, lookupId)

        const result = await callDVMCPTool(toolName, args)
        if (result) {
            setSelectedResult(result)
            setActiveTab('details')
        }
    }

    const handleViewDetails = (result: SearchResult) => {
        setSelectedResult(result)
        setActiveTab('details')
    }

    const handleDetailedLookup = (id: string) => {
        setLookupId(id)
        handleLookup()
    }

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
                    <SearchForm
                        searchType={searchType}
                        formData={formData}
                        isLoading={isLoading}
                        onSearchTypeChange={setSearchType}
                        onFormDataChange={(data) => setFormData((prev) => ({ ...prev, ...data }))}
                        onSubmit={handleSearch}
                        getToolCost={getToolCost}
                    />

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
                                <ScrollArea className="h-96">
                                    {results.map((result, index) => (
                                        <SearchResultCard
                                            key={result.id || index}
                                            result={result}
                                            searchType={searchType}
                                            onViewDetails={handleViewDetails}
                                            onDetailedLookup={handleDetailedLookup}
                                        />
                                    ))}
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="lookup" className="space-y-6">
                    <LookupForm
                        searchType={searchType}
                        lookupId={lookupId}
                        isLoading={isLoading}
                        onSearchTypeChange={setSearchType}
                        onLookupIdChange={setLookupId}
                        onSubmit={handleLookup}
                        getToolCost={getToolCost}
                    />
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
                                <DetailedResultView result={selectedResult} searchType={searchType} />
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
