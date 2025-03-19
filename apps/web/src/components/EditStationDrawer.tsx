import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/hooks/use-toast'
import { nostrService } from '@/lib/services/ndk'
import { closeStationDrawer } from '@/lib/store/ui'
import {
    createRadioEvent,
    deleteStation,
    StationSchema,
    updateStation,
    type Station,
    type StationFormData,
} from '@wavefunc/common'
import { zodResolver } from '@hookform/resolvers/zod'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { AlertCircle, Plus, Trash, Wand2, X } from 'lucide-react'
import React from 'react'
import { Controller, useForm } from 'react-hook-form'

interface EditStationDrawerProps {
    station?: Station
    isOpen: boolean
    // onClose: () => void;
    // onSave: (station: Partial<Station>) => void;
    // onDelete?: (stationId: string) => void;
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
    // Handle PLS files
    if (url.toLowerCase().endsWith('.pls')) {
        try {
            const content = await fetchPlsContent(url)
            const streamUrls = parsePlsContent(content)

            if (streamUrls.length === 0) {
                throw new Error('No stream URLs found in PLS file')
            }

            // Use the first stream URL and detect its quality
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

    // Handle M3U/M3U8 files
    if (url.toLowerCase().endsWith('.m3u') || url.toLowerCase().endsWith('.m3u8')) {
        return {
            url: url,
            format: 'application/x-mpegURL',
            quality: { bitrate: 128000, codec: 'mp3', sampleRate: 44100 },
            primary: true,
        }
    }

    // Handle direct stream URLs
    return {
        url: url,
        format: detectStreamFormat(url),
        quality: detectStreamQuality(url),
        primary: true,
    }
}

export function EditStationDrawer({ station, isOpen }: EditStationDrawerProps) {
    const [isDeleting, setIsDeleting] = React.useState(false)
    const { toast } = useToast()
    const handleClose = () => {
        closeStationDrawer()
    }

    const {
        control,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors },
    } = useForm<StationFormData>({
        resolver: zodResolver(StationSchema),
        defaultValues: station || {
            name: '',
            description: '',
            website: '',
            genre: '',
            imageUrl: '',
            streams: [emptyStream],
            tags: [],
        },
    })

    React.useEffect(() => {
        if (station) {
            reset(station)
        }
    }, [station, reset])

    const streams = watch('streams')

    const onSubmit = async (data: StationFormData) => {
        try {
            const ndk = nostrService.getNDK()

            if (station?.naddr) {
                const ndkEvent = await updateStation(ndk, station, {
                    name: data.name,
                    description: data.description,
                    website: data.website,
                    streams: data.streams,
                    genre: data.genre,
                    imageUrl: data.imageUrl,
                })

                handleClose()
            } else {
                const tags = [
                    ['genre', data.genre],
                    ['thumbnail', data.imageUrl],
                    ['client', 'nostr_radio'],
                ]

                const event = createRadioEvent(
                    {
                        name: data.name,
                        description: data.description,
                        website: data.website,
                        streams: data.streams,
                    },
                    tags,
                )

                const ndkEvent = new NDKEvent(ndk, event)

                if (ndkEvent) {
                    await ndkEvent.publish()
                    toast({
                        title: 'Station created',
                        description: 'Station created successfully',
                    })
                    handleClose()
                }
            }
        } catch (error) {
            console.error('Error creating/updating station:', error)
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
            const ndk = nostrService.getNDK()
            await deleteStation(ndk, station.id)

            handleClose()
        } catch (error) {
            console.error('Error deleting station:', error)
        } finally {
            setIsDeleting(false)
        }
    }

    const handleStreamUrlPaste = async (index: number, url: string) => {
        try {
            const parsedStream = await parseStreamUrl(url)
            setValue(`streams.${index}`, parsedStream)
            toast.success('Stream details auto-detected!')
        } catch (error) {
            console.error('Error parsing stream URL:', error)
            toast.error('Could not auto-detect stream details')
        }
    }

    return (
        <Sheet open={isOpen}>
            <SheetContent className="w-[90vw] sm:max-w-[540px] overflow-y-auto">
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
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-6">
                        {station?.naddr}
                        <div className="space-y-2">
                            <Label htmlFor="name">Station Name</Label>
                            <Controller name="name" control={control} render={({ field }) => <Input {...field} />} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={watch('description') || ''}
                                onChange={(e) => setValue('description', e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="website">Website</Label>
                            <Input
                                id="website"
                                type="url"
                                value={watch('website') || ''}
                                onChange={(e) => setValue('website', e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="genre">Genre</Label>
                            <Input
                                id="genre"
                                value={watch('genre') || ''}
                                onChange={(e) => setValue('genre', e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="imageUrl">Thumbnail URL</Label>
                            <Input
                                id="imageUrl"
                                type="url"
                                value={watch('imageUrl') || ''}
                                onChange={(e) => setValue('imageUrl', e.target.value)}
                                required
                            />
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
                            <Button type="submit" className="bg-primary text-white">
                                {station ? 'Save Changes' : 'Create Station'}
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
                    </form>
                )}
            </SheetContent>
        </Sheet>
    )
}
