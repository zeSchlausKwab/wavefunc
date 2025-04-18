/**
 * Utility functions for working with audio streams
 */

export interface StreamMetadata {
    title?: string
    artist?: string
    album?: string
    artwork?: string
    icyName?: string
    icyDescription?: string
    icyGenre?: string
    icyBitrate?: string
    icySamplerate?: string
    songTitle?: string
    songArtist?: string
    songAlbum?: string
    songYear?: string
    songGenre?: string
    streamUrl?: string
    streamType?: string
    hasIcyMetadata?: boolean
}

/**
 * Extracts ICY metadata from a stream
 * Works with Shoutcast/Icecast streams
 */
export async function extractStreamMetadata(url: string): Promise<StreamMetadata> {
    const metadata: StreamMetadata = {
        streamUrl: url,
    }

    try {
        // First try a HEAD request to get basic ICY metadata
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'cors',
            })

            // Extract metadata from headers
            const headers = response.headers
            if (headers.get('icy-name')) metadata.icyName = headers.get('icy-name') || undefined
            if (headers.get('icy-description')) metadata.icyDescription = headers.get('icy-description') || undefined
            if (headers.get('icy-genre')) metadata.icyGenre = headers.get('icy-genre') || undefined
            if (headers.get('icy-br')) metadata.icyBitrate = headers.get('icy-br') || undefined
            if (headers.get('icy-sr')) metadata.icySamplerate = headers.get('icy-sr') || undefined

            // Detect stream type from content-type
            if (headers.get('content-type')) {
                const contentType = headers.get('content-type') || ''

                if (contentType.includes('audio/mpeg')) {
                    metadata.streamType = 'MP3'
                } else if (contentType.includes('audio/aac')) {
                    metadata.streamType = 'AAC'
                } else if (contentType.includes('audio/ogg')) {
                    metadata.streamType = 'Ogg'
                } else if (contentType.includes('audio/wav')) {
                    metadata.streamType = 'WAV'
                } else if (contentType.includes('audio/x-flac')) {
                    metadata.streamType = 'FLAC'
                } else if (contentType.includes('application/ogg')) {
                    metadata.streamType = 'Ogg'
                } else {
                    metadata.streamType = contentType
                }
            }
        } catch (headError) {
            console.warn('HEAD request failed:', headError)
        }

        // Then try a short GET request to get streaming metadata
        try {
            // Fetch with timeout to avoid downloading too much data
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 3000)

            const getResponse = await fetch(url, {
                method: 'GET',
                headers: {
                    'Icy-MetaData': '1', // Request ICY metadata
                },
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            // Check for ICY metadata interval
            const icyMetaInt = getResponse.headers.get('icy-metaint')
            if (icyMetaInt) {
                metadata.hasIcyMetadata = true
            }

            // Extract additional headers from GET request
            const headers = getResponse.headers
            if (!metadata.icyName && headers.get('icy-name')) metadata.icyName = headers.get('icy-name') || undefined
            if (!metadata.icyDescription && headers.get('icy-description'))
                metadata.icyDescription = headers.get('icy-description') || undefined
            if (!metadata.icyGenre && headers.get('icy-genre'))
                metadata.icyGenre = headers.get('icy-genre') || undefined
            if (!metadata.icyBitrate && headers.get('icy-br')) metadata.icyBitrate = headers.get('icy-br') || undefined
            if (!metadata.icySamplerate && headers.get('icy-sr'))
                metadata.icySamplerate = headers.get('icy-sr') || undefined

            // Set title from ICY name if available
            if (metadata.icyName && !metadata.title) {
                metadata.title = metadata.icyName
            }

            // Abort the connection to avoid downloading the entire stream
            controller.abort()
        } catch (getError) {
            console.warn('GET request failed or was aborted:', getError)
        }
    } catch (error) {
        console.error('Failed to extract metadata from stream:', error)
    }

    return metadata
}

/**
 * Parse ICY metadata from a stream
 * This function parses the format: StreamTitle='Artist - Title';StreamUrl='';
 */
export function parseIcyMetadata(metadataString: string): StreamMetadata {
    const metadata: StreamMetadata = {}

    try {
        // Extract StreamTitle
        const titleMatch = metadataString.match(/StreamTitle='([^']*)'/)
        if (titleMatch && titleMatch[1]) {
            const streamTitle = titleMatch[1]
            metadata.songTitle = streamTitle

            // Try to split artist and title (common format is "Artist - Title")
            const parts = streamTitle.split(' - ')
            if (parts.length >= 2) {
                metadata.songArtist = parts[0].trim()
                metadata.songTitle = parts.slice(1).join(' - ').trim()
            }
        }

        // Extract StreamUrl
        const urlMatch = metadataString.match(/StreamUrl='([^']*)'/)
        if (urlMatch && urlMatch[1]) {
            metadata.artwork = urlMatch[1]
        }
    } catch (error) {
        console.warn('Error parsing ICY metadata:', error)
    }

    return metadata
}

/**
 * Check if a stream is likely to contain metadata
 * Based on common stream formats and headers
 */
export function streamLikelyHasMetadata(url: string, contentType?: string): boolean {
    // Check URL patterns
    const urlLower = url.toLowerCase()

    // Common streaming server patterns
    if (
        urlLower.includes('shoutcast') ||
        urlLower.includes('icecast') ||
        urlLower.includes('stream') ||
        urlLower.includes('live')
    ) {
        return true
    }

    // Check content type if available
    if (contentType) {
        if (
            contentType.includes('audio/mpeg') ||
            contentType.includes('audio/aac') ||
            contentType.includes('audio/ogg')
        ) {
            return true
        }
    }

    // Check file extensions
    if (urlLower.endsWith('.mp3') || urlLower.endsWith('.aac') || urlLower.endsWith('.ogg')) {
        return true
    }

    return false
}

/**
 * Register ICY metadata handlers on an audio element
 */
export function setupMetadataListeners(
    audioElement: HTMLAudioElement,
    onMetadataChange: (metadata: StreamMetadata) => void,
): () => void {
    // Handler for standard metadata
    const handleMetadata = () => {
        try {
            // Try to access media tags if available
            const mediaElement = audioElement as any

            if (mediaElement.mozGetMetadata) {
                const mozMetadata = mediaElement.mozGetMetadata()
                if (mozMetadata) {
                    const metadata: StreamMetadata = {
                        songTitle: mozMetadata.title,
                        songArtist: mozMetadata.artist,
                        songAlbum: mozMetadata.album,
                    }
                    onMetadataChange(metadata)
                }
            }
        } catch (e) {
            console.warn('Error accessing media metadata:', e)
        }
    }

    // Custom event for ICY metadata
    const handleIcyMetadata = (event: any) => {
        if (event.detail) {
            const icyData = parseIcyMetadata(event.detail)
            onMetadataChange(icyData)
        }
    }

    // Add event listeners
    audioElement.addEventListener('loadedmetadata', handleMetadata)
    audioElement.addEventListener('icy-metadata', handleIcyMetadata as EventListener)

    // Return function to clean up
    return () => {
        audioElement.removeEventListener('loadedmetadata', handleMetadata)
        audioElement.removeEventListener('icy-metadata', handleIcyMetadata as EventListener)
    }
}
