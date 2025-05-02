import { zodResolver } from '@hookform/resolvers/zod'
import type NDK from '@nostr-dev-kit/ndk'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import {
    closeStationDrawer,
    deleteStation as commonDeleteStation,
    updateStation as commonUpdateStation,
    convertFromRadioBrowser,
    createRadioEvent,
    ndkActions,
    StationSchema,
    type Station,
    type StationFormData,
} from '@wavefunc/common'
import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@wavefunc/ui/components/ui/sheet'
import { Textarea } from '@wavefunc/ui/components/ui/textarea'
import { AlertCircle, ExternalLink, Import, Plus, Trash, Wand2, X } from 'lucide-react'
import React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

// TagInput component for adding and removing tags
const TagInput = ({
    tags,
    setTags,
    placeholder = 'Add a tag...',
    className = '',
}: {
    tags: string[]
    setTags: (tags: string[]) => void
    placeholder?: string
    className?: string
}) => {
    const [inputValue, setInputValue] = React.useState('')

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            addTag()
        }
    }

    const addTag = () => {
        const trimmedInput = inputValue.trim()
        if (trimmedInput && !tags.includes(trimmedInput)) {
            setTags([...tags, trimmedInput])
            setInputValue('')
        }
    }

    const removeTag = (tagToRemove: string) => {
        setTags(tags.filter((tag) => tag !== tagToRemove))
    }

    const handleInputBlur = () => {
        addTag()
    }

    return (
        <div className={`flex flex-wrap gap-2 p-2 border rounded-md ${className}`}>
            {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-destructive/20"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </Badge>
            ))}
            <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                placeholder={tags.length === 0 ? placeholder : ''}
                className="flex-grow outline-none bg-transparent min-w-[80px]"
            />
        </div>
    )
}

interface EditStationDrawerProps {
    station?: Station
    isOpen: boolean
}

const emptyStream = {
    url: '',
    format: 'audio/mpeg',
    quality: {
        bitrate: 128000,
        codec: 'mp3',
        sampleRate: 44100,
    },
    primary: true,
}

// Wrapper functions to handle NDK type compatibility
const updateStation = (ndk: NDK, station: Station, data: any) => {
    return commonUpdateStation(ndk as any, station, data)
}

const deleteStation = (ndk: NDK, stationId: string) => {
    return commonDeleteStation(ndk as any, stationId)
}

// Helper functions for stream URL parsing
function detectStreamFormat(url: string): string {
    const lowerUrl = url.toLowerCase()
    if (lowerUrl.includes('.mp3')) return 'audio/mpeg'
    if (lowerUrl.includes('.aac')) return 'audio/aac'
    if (lowerUrl.includes('.ogg')) return 'audio/ogg'
    if (lowerUrl.includes('.m3u8')) return 'application/x-mpegURL'
    if (lowerUrl.includes('.pls')) return 'audio/x-scpls'
    return 'audio/mpeg' // default
}

function detectStreamQuality(url: string): {
    bitrate: number
    codec: string
    sampleRate: number
} {
    const lowerUrl = url.toLowerCase()
    if (lowerUrl.includes('128')) return { bitrate: 128000, codec: 'mp3', sampleRate: 44100 }
    if (lowerUrl.includes('256')) return { bitrate: 256000, codec: 'mp3', sampleRate: 48000 }
    if (lowerUrl.includes('320')) return { bitrate: 320000, codec: 'mp3', sampleRate: 48000 }
    if (lowerUrl.includes('64')) return { bitrate: 64000, codec: 'mp3', sampleRate: 44100 }
    return { bitrate: 128000, codec: 'mp3', sampleRate: 44100 } // default
}

async function fetchPlsContent(url: string): Promise<string> {
    try {
        const response = await fetch(url)
        if (!response.ok) throw new Error('Failed to fetch PLS file')
        return await response.text()
    } catch (error) {
        console.error('Error fetching PLS file:', error)
        throw error
    }
}

function parsePlsContent(content: string): string[] {
    const lines = content.split('\n')
    const streamUrls: string[] = []

    for (const line of lines) {
        if (line.toLowerCase().startsWith('file')) {
            const url = line.split('=')[1]?.trim()
            if (url) streamUrls.push(url)
        }
    }

    return streamUrls
}

async function parseStreamUrl(url: string) {
    if (url.toLowerCase().endsWith('.pls')) {
        try {
            const content = await fetchPlsContent(url)
            const streamUrls = parsePlsContent(content)

            if (streamUrls.length === 0) {
                throw new Error('No stream URLs found in PLS file')
            }

            const streamUrl = streamUrls[0]
            return {
                url: streamUrl,
                format: 'audio/mpeg',
                quality: detectStreamQuality(streamUrl),
                primary: true,
            }
        } catch (error) {
            console.error('Error parsing PLS file:', error)
            throw error
        }
    }

    if (url.toLowerCase().endsWith('.m3u') || url.toLowerCase().endsWith('.m3u8')) {
        return {
            url: url,
            format: 'application/x-mpegURL',
            quality: { bitrate: 128000, codec: 'mp3', sampleRate: 44100 },
            primary: true,
        }
    }

    return {
        url: url,
        format: detectStreamFormat(url),
        quality: detectStreamQuality(url),
        primary: true,
    }
}

async function fetchFromRadioBrowser(stationName: string) {
    try {
        const encodedName = encodeURIComponent(stationName)
        const response = await fetch(`https://de1.api.radio-browser.info/json/stations/byname/${encodedName}`)

        if (!response.ok) {
            throw new Error('Failed to fetch from radio-browser.info')
        }

        const data = await response.json()
        return data.length > 0 ? data[0] : null
    } catch (error) {
        console.error('Error fetching from radio-browser.info:', error)
        throw error
    }
}

async function detectStreamingServerUrl(streams: { url: string }[]): Promise<{ url: string } | null> {
    if (!streams || streams.length === 0) return null

    const streamUrls = streams.map((stream) => stream.url)
    const serverUrls = new Set<string>()

    for (const url of streamUrls) {
        try {
            const parsedUrl = new URL(url)
            const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`
            serverUrls.add(baseUrl)
        } catch (error) {
            console.error('Error parsing URL:', error)
        }
    }

    for (const serverUrl of serverUrls) {
        const mightBeIcecast =
            serverUrl.includes('icecast') ||
            serverUrl.includes('stream') ||
            serverUrl.includes('radio') ||
            serverUrl.includes('audio') ||
            streamUrls.some((url) => url.includes('.pls') || url.includes('.m3u'))

        const statusUrl = `${serverUrl}/status-json.xsl`
        const proxyUrl = `/api/proxy/icecast?url=${encodeURIComponent(statusUrl)}`

        try {
            const response = await fetch(proxyUrl)

            if (response.ok) {
                toast('Streaming server detected!', {
                    description: `Found Icecast server at ${serverUrl}`,
                })
                return { url: serverUrl }
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Invalid response from server' }))
                console.warn('Error from proxy:', errorData)
                throw new Error(errorData.error || 'Failed to validate streaming server')
            }
        } catch (error) {
            console.warn('Error accessing Icecast status:', error)

            const errorMessage = error instanceof Error ? error.message : String(error)
            const isProxyError = errorMessage.includes('Failed to fetch Icecast server')

            if (
                mightBeIcecast &&
                !isProxyError &&
                !(error instanceof Error && error.message.includes('Failed to validate'))
            ) {
                toast('Potential streaming server detected', {
                    description: 'Could not verify server but URL pattern suggests a streaming server.',
                    duration: 5000,
                })
                return { url: serverUrl }
            }

            if (isProxyError) {
                throw new Error('Server does not appear to be a valid Icecast streaming server')
            }

            continue
        }
    }

    throw new Error('Could not verify any streaming server')
}

export function EditStationDrawer({ station, isOpen }: EditStationDrawerProps) {
    const [isDeleting, setIsDeleting] = React.useState(false)
    const [isImporting, setIsImporting] = React.useState(false)
    const [importName, setImportName] = React.useState('')
    const [streamingServerUrlError, setStreamingServerUrlError] = React.useState<string | null>(null)
    const handleClose = () => {
        closeStationDrawer()
    }

    const {
        control,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<StationFormData>({
        // @ts-ignore
        resolver: zodResolver(StationSchema),
        defaultValues: {
            name: '',
            description: '',
            website: '',
            thumbnail: '',
            countryCode: '',
            languageCodes: [],
            tags: [],
            streams: [emptyStream],
            streamingServerUrl: '',
        },
    })

    const [submitError, setSubmitError] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (station) {
            // Convert station.tags (string[][]) to string[] for form tags
            const formTags = station.tags
                .filter((tag) => tag[0] === 't')
                .map((tag) => tag[1])
                .filter(Boolean)

            // Extract language codes - try languageCodes first, then fall back to 'l' tags
            const languageCodes =
                station.languageCodes ||
                station.tags
                    .filter((tag) => tag[0] === 'l')
                    .map((tag) => tag[1])
                    .filter(Boolean)

            // Create a properly typed StationFormData object
            const formData: StationFormData = {
                name: station.name,
                description: station.description,
                website: station.website,
                thumbnail: station.imageUrl,
                countryCode: station.countryCode || station.tags.find((tag) => tag[0] === 'countryCode')?.[1] || '',
                languageCodes: languageCodes,
                tags: formTags,
                streams: station.streams.map((stream) => ({
                    ...stream,
                    primary: stream.primary ?? false,
                })),
                streamingServerUrl: station.streamingServerUrl || '',
            }

            reset(formData)
        }
    }, [station, reset])

    const streams = watch('streams')

    const onSubmit = async (data: StationFormData) => {
        // TODO: wrap everything in react-query, this is not reactive
        try {
            setSubmitError(null)
            const ndk = ndkActions.getNDK()

            if (!ndk) {
                throw new Error('NDK not initialized')
            }

            if (station?.naddr) {
                console.log('Updating existing station:', station.id)

                // @ts-ignore
                const ndkEvent = await updateStation(ndk, station, {
                    name: data.name,
                    description: data.description,
                    website: data.website,
                    streams: data.streams,
                    thumbnail: data.thumbnail,
                    countryCode: data.countryCode,
                    languageCodes: data.languageCodes,
                    tags: data.tags,
                    streamingServerUrl: data.streamingServerUrl,
                })

                console.log('Station updated successfully:', ndkEvent)

                handleClose()
                toast('Station updated', {
                    description: 'Your changes have been saved successfully.',
                })
            } else {
                console.log('Creating new station')

                const event = createRadioEvent(
                    {
                        description: data.description,
                        streams: data.streams,
                        streamingServerUrl: data.streamingServerUrl || undefined,
                    },
                    [
                        ['name', data.name],
                        ...(data.thumbnail ? [['thumbnail', data.thumbnail]] : []),
                        ...(data.website ? [['website', data.website]] : []),
                        ...data.tags.map((tag) => ['t', tag]),
                        ...data.languageCodes.map((code) => ['l', code]),
                        ...(data.countryCode ? [['countryCode', data.countryCode]] : []),
                    ],
                )

                const ndkEvent = new NDKEvent(ndk, event)

                if (ndkEvent) {
                    await ndkEvent.publish()
                    console.log('Station created successfully:', ndkEvent)
                    toast('Station created', {
                        description: 'Station created successfully',
                    })
                    handleClose()
                }
            }
        } catch (error) {
            console.error('Error creating/updating station:', error)
            const errorMessage =
                error instanceof Error ? error.message : 'Failed to save the station. Please try again.'
            setSubmitError(errorMessage)
            toast('Error', {
                description: errorMessage,
                style: {
                    background: 'red',
                },
            })
        }
    }

    const handleAddStream = () => {
        setValue('streams', [...streams, { ...emptyStream, primary: false }])
    }

    const handleRemoveStream = (index: number) => {
        setValue(
            'streams',
            streams.filter((_, i) => i !== index),
        )
    }

    const handleDeleteStation = async () => {
        if (!station || !station.id) return

        try {
            const ndk = ndkActions.getNDK()

            if (!ndk) {
                throw new Error('NDK not initialized')
            }

            await deleteStation(ndk, station.id)
            toast('Station deleted', {
                description: 'Station has been removed successfully',
            })
            handleClose()
        } catch (error) {
            console.error('Error deleting station:', error)
            toast('Error', {
                description: 'Failed to delete the station. Please try again.',
                style: {
                    background: 'red',
                },
            })
        } finally {
            setIsDeleting(false)
        }
    }

    const handleStreamUrlPaste = async (index: number, url: string) => {
        try {
            const parsedStream = await parseStreamUrl(url)
            setValue(`streams.${index}`, parsedStream)
            toast('Stream details auto-detected!', {
                description: 'Stream details auto-detected!',
            })
        } catch (error) {
            console.error('Error parsing stream URL:', error)
            toast('Could not auto-detect stream details', {
                style: {
                    background: 'red',
                },
            })
        }
    }

    // TODO: allow search or remove
    // TODO: implement a check for the websiote name for similarities

    const handleImportFromRadioBrowser = async () => {
        if (!importName.trim()) {
            toast('Error', {
                description: 'Please enter a station name to import',
                style: {
                    background: 'red',
                },
            })
            return
        }

        try {
            setIsImporting(true)
            const stationData = await fetchFromRadioBrowser(importName)
            if (!stationData) {
                toast('Not found', {
                    description: 'No station found with that name in radio-browser.info',
                    style: {
                        background: 'red',
                    },
                })
                return
            }

            // Convert to our format
            const { content, tags } = convertFromRadioBrowser(stationData)

            // Set form values
            setValue('name', stationData.name)
            setValue('description', content.description)
            setValue('website', stationData.homepage || '')
            setValue('streams', content.streams)
            setValue('thumbnail', stationData.favicon || '')
            setValue('countryCode', stationData.countrycode || '')
            // Extract language codes from comma-separated string
            const languageCodes = stationData.languagecodes
                ? stationData.languagecodes
                      .split(',')
                      .map((l: string) => l.trim())
                      .filter(Boolean)
                : []

            setValue('languageCodes', languageCodes)

            // Set tags from radio browser genres
            if (stationData.tags) {
                const genreTags = stationData.tags
                    .split(',')
                    .map((tag: string) => tag.trim())
                    .filter(Boolean)
                setValue('tags', genreTags)
            }

            toast('Station imported from radio-browser.info!', {
                description: 'Station imported from radio-browser.info!',
            })

            // Close import section
            setIsImporting(false)
            setImportName('')
        } catch (error) {
            console.error('Error importing from radio-browser.info:', error)
            toast('Error', {
                description: 'Failed to import station data. Please try again.',
                style: {
                    background: 'red',
                },
            })
        } finally {
            setIsImporting(false)
        }
    }

    // Update the handleDetectStreamingServer function
    const handleDetectStreamingServer = async () => {
        try {
            const streams = watch('streams')
            if (!streams || streams.length === 0) {
                toast('No streams available', {
                    style: { background: 'red' },
                })
                return
            }

            toast('Detecting streaming server...', {
                duration: 2000,
            })

            // Reset previous error state
            setStreamingServerUrlError(null)

            try {
                const result = await detectStreamingServerUrl(streams)
                if (result) {
                    setValue('streamingServerUrl', result.url)
                    toast('Streaming server detected!', {
                        description: `Found server at ${result.url}`,
                    })
                }
            } catch (error) {
                console.error('Error detecting streaming server:', error)
                // Set error state to trigger visual feedback
                if (error instanceof Error) {
                    setStreamingServerUrlError(error.message)
                } else {
                    setStreamingServerUrlError('Failed to validate streaming server')
                }

                // Keep the current URL but mark it as invalid
                toast('Invalid streaming server URL', {
                    description: 'The server could not be validated. Please correct or clear the URL.',
                    style: { background: 'red' },
                })
            }
        } catch (error) {
            console.error('Unexpected error:', error)
            setStreamingServerUrlError('An unexpected error occurred')
            toast('Error detecting streaming server', {
                style: { background: 'red' },
            })
        }
    }

    return (
        <Sheet
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) handleClose()
            }}
        >
            <SheetContent className="w-[90vw] sm:max-w-[640px] overflow-y-auto">
                <div className="absolute right-4 top-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        className="h-6 w-6 rounded-md"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <SheetHeader>
                    <SheetTitle className="text-primary text-lg font-press-start-2p">
                        {station ? 'Edit Station' : 'Create Station'}
                    </SheetTitle>
                    <SheetDescription className="font-press-start-2p text-xs">
                        {station ? 'Make changes to your radio station here.' : 'Create a new radio station.'}
                    </SheetDescription>
                </SheetHeader>

                {isDeleting ? (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center space-x-2 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            <h3 className="font-semibold">Are you sure you want to delete this station?</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            This action cannot be undone. The station will be permanently deleted.
                        </p>
                        <div className="flex space-x-2 mt-6">
                            <Button variant="destructive" onClick={handleDeleteStation} className="mr-2">
                                <Trash className="h-4 w-4 mr-2" />
                                Yes, Delete Station
                            </Button>
                            <Button variant="outline" onClick={() => setIsDeleting(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    // @ts-ignore
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-6">
                        {!station && (
                            <div className="mb-6 p-4 border rounded-lg">
                                <div className="flex justify-between items-center mb-2">
                                    <Label>Import from radio-browser.info</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsImporting(!isImporting)}
                                    >
                                        {isImporting ? 'Cancel' : 'Import'}
                                    </Button>
                                </div>

                                {isImporting && (
                                    <div className="mt-4 space-y-2">
                                        <Label htmlFor="import-name">Station Name</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="import-name"
                                                value={importName}
                                                onChange={(e) => setImportName(e.target.value)}
                                                placeholder="Enter station name to import"
                                            />
                                            <Button
                                                type="button"
                                                onClick={handleImportFromRadioBrowser}
                                                disabled={!importName.trim()}
                                            >
                                                <Import className="h-4 w-4 mr-2" />
                                                Import
                                            </Button>
                                        </div>
                                        <div className="text-xs text-muted-foreground flex items-center mt-1">
                                            <ExternalLink className="h-3 w-3 mr-1" />
                                            <a
                                                href="https://www.radio-browser.info"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:underline"
                                            >
                                                radio-browser.info
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="name">Station Name</Label>
                            <Controller name="name" control={control} render={({ field }) => <Input {...field} />} />
                            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={watch('description') || ''}
                                onChange={(e) => setValue('description', e.target.value)}
                                required
                            />
                            {errors.description && (
                                <p className="text-sm text-destructive">{errors.description.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="website">Website (Optional)</Label>
                            <Input
                                id="website"
                                type="url"
                                value={watch('website') || ''}
                                onChange={(e) => setValue('website', e.target.value)}
                            />
                            {errors.website && <p className="text-sm text-destructive">{errors.website.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="thumbnail">Thumbnail URL (Optional)</Label>
                            <Input
                                id="thumbnail"
                                type="url"
                                value={watch('thumbnail') || ''}
                                onChange={(e) => setValue('thumbnail', e.target.value)}
                            />
                            {errors.thumbnail && <p className="text-sm text-destructive">{errors.thumbnail.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="streamingServerUrl">Streaming Server URL (Optional)</Label>
                            <div className="relative">
                                <Input
                                    id="streamingServerUrl"
                                    type="url"
                                    value={watch('streamingServerUrl') || ''}
                                    onChange={(e) => {
                                        setValue('streamingServerUrl', e.target.value)
                                        // Clear error state when user modifies the field
                                        if (streamingServerUrlError) setStreamingServerUrlError(null)
                                    }}
                                    placeholder="https://streaming-server.com"
                                    className={streamingServerUrlError ? 'border-destructive' : ''}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-2 top-1/2 -translate-y-1/2"
                                    onClick={handleDetectStreamingServer}
                                    title="Auto-detect streaming server from stream URLs"
                                >
                                    <Wand2 className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Checks if the server has a public '/status-json.xsl' endpoint typical of Icecast
                                servers.
                            </p>
                            {streamingServerUrlError && (
                                <p className="text-sm text-destructive">{streamingServerUrlError}</p>
                            )}
                            {errors.streamingServerUrl && (
                                <p className="text-sm text-destructive">{errors.streamingServerUrl.message}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="tags">Genres/Tags (comma separated)</Label>
                                <TagInput
                                    tags={watch('tags') || []}
                                    setTags={(tags) => setValue('tags', tags)}
                                    placeholder="jazz, pop, rock, classical"
                                />
                                {errors.tags && <p className="text-sm text-destructive">{errors.tags.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="countryCode">Country Code (ISO 3166-2)</Label>
                                <Input
                                    id="countryCode"
                                    value={watch('countryCode') || ''}
                                    onChange={(e) => setValue('countryCode', e.target.value)}
                                    placeholder="US"
                                    maxLength={10}
                                />
                                {errors.countryCode && (
                                    <p className="text-sm text-destructive">{errors.countryCode.message}</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="languageCodes">Language Codes (comma separated)</Label>
                            <TagInput
                                tags={watch('languageCodes') || []}
                                setTags={(codes) => setValue('languageCodes', codes)}
                                placeholder="en, es, fr"
                            />
                            {errors.languageCodes && (
                                <p className="text-sm text-destructive">{errors.languageCodes.message}</p>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <Label>Streams</Label>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddStream}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Stream
                                </Button>
                            </div>
                            {streams.map((stream, index) => (
                                <div key={index} className="space-y-2 p-4 border rounded-lg">
                                    <div className="flex justify-between">
                                        <Label>Stream {index + 1}</Label>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveStream(index)}
                                            disabled={streams.length === 1}
                                        >
                                            <Trash className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                    <Controller
                                        name={`streams.${index}.url`}
                                        control={control}
                                        render={({ field }) => (
                                            <div className="relative">
                                                <Input
                                                    {...field}
                                                    placeholder="Stream URL"
                                                    onPaste={async (e) => {
                                                        const pastedText = e.clipboardData.getData('text')
                                                        await handleStreamUrlPaste(index, pastedText)
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute right-2 top-1/2 -translate-y-1/2"
                                                    onClick={async () => {
                                                        await handleStreamUrlPaste(index, field.value)
                                                    }}
                                                >
                                                    <Wand2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label>Format</Label>
                                            <Input
                                                value={stream.format || ''}
                                                onChange={(e) => setValue(`streams.${index}.format`, e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <Label>Primary</Label>
                                            <input
                                                type="checkbox"
                                                checked={stream.primary}
                                                onChange={(e) => setValue(`streams.${index}.primary`, e.target.checked)}
                                                className="mt-2"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between space-x-2">
                            <Button type="submit" className="bg-primary text-white" disabled={isSubmitting}>
                                {isSubmitting ? 'Saving...' : station ? 'Save Changes' : 'Create Station'}
                            </Button>
                            <div className="flex space-x-2">
                                {station && (
                                    <Button type="button" onClick={() => setIsDeleting(true)} variant="destructive">
                                        <Trash className="mr-2 h-4 w-4" />
                                        Delete
                                    </Button>
                                )}
                                <Button type="button" onClick={handleClose} variant="outline">
                                    <X className="mr-2 h-4 w-4" />
                                    Cancel
                                </Button>
                            </div>
                        </div>

                        {submitError && (
                            <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-md text-destructive text-sm">
                                <div className="flex items-center">
                                    <AlertCircle className="h-4 w-4 mr-2" />
                                    <span>{submitError}</span>
                                </div>
                            </div>
                        )}
                    </form>
                )}
            </SheetContent>
        </Sheet>
    )
}
