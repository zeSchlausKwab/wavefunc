import { NDKEvent, type NostrEvent } from '@nostr-dev-kit/ndk'
import { createDVMCPService } from '@wavefunc/common/src/services/dvmcp'
import type { RecognitionResult } from '@wavefunc/common/src/types/recognition'
import { useState } from 'react'
import { toast } from 'sonner'
import { useNwcPayment } from './useNwcPayment'
import { ndkActions } from '../lib/store/ndk'

export function useMusicRecognition() {
    const [isLoading, setIsLoading] = useState(false)
    const [result, setResult] = useState<RecognitionResult | null>(null)
    const { paymentStatus, processNwcPayment, requestPayment, setPaymentStatus, paymentAmount, paymentInvoice } =
        useNwcPayment()

    const uploadToBlossom = async (audioBlob: Blob): Promise<string> => {
        const ndk = ndkActions.getNDK()
        console.log('Uploading to Blossom CDN...')
        const uploadAuth: NostrEvent = {
            created_at: Math.ceil(Date.now() / 1000),
            kind: 22242,
            content: 'Authorize Upload',
            tags: [
                ['name', 'sample.webm'],
                ['size', audioBlob.size.toString()],
                ['label', 'music-recognition'],
                ['mime', 'audio/webm'],
            ],
            pubkey: ndk?.activeUser?.pubkey || '',
            id: '',
            sig: '',
        }

        if (!ndk) throw new Error('NDK not initialized')

        const ev = new NDKEvent(ndk, uploadAuth)
        await ev.sign()

        const response = await fetch(
            `https://api.satellite.earth/v1/media/item?auth=${encodeURIComponent(JSON.stringify(ev))}`,
            {
                method: 'PUT',
                body: audioBlob,
                headers: { 'Content-Type': 'audio/webm' },
            },
        )

        if (!response.ok) throw new Error(`Blossom CDN upload error: ${response.statusText}`)
        const result = await response.json()
        if (!result.url) throw new Error('No URL returned from Blossom CDN')
        return result.url
    }

    const handleRecognitionResult = async (enrichedResult: any) => {
        console.log('[Music Recognition] Received enriched result:', enrichedResult)

        // Handle the case where the result is already in the expected format
        let recognition = enrichedResult

        // If the result has a nested recognition object, extract it
        if (enrichedResult.recognition) {
            recognition = enrichedResult.recognition
        }

        if (!recognition.title || !recognition.artist) {
            throw new Error('Invalid recognition data - missing title or artist')
        }

        // Create the enhanced result with the enriched data from DVMCP
        const enhancedResult: RecognitionResult = {
            ...recognition,
        }

        // Add Discogs data if available and has meaningful content
        if (enrichedResult.discogs && enrichedResult.discogs.results && enrichedResult.discogs.results.length > 0) {
            const discogsRelease = enrichedResult.discogs.results[0]
            enhancedResult.discogs = {
                id: discogsRelease.id,
                title: discogsRelease.title,
                year: discogsRelease.year,
                country: discogsRelease.country,
                genres: discogsRelease.genre,
                styles: discogsRelease.style,
                labels: discogsRelease.label?.map((labelName: string, index: number) => ({
                    name: labelName,
                    catno: discogsRelease.catno || '',
                })),
                formats: discogsRelease.format?.map((formatName: string) => ({
                    name: formatName,
                    descriptions: discogsRelease.formats?.[0]?.descriptions || [],
                })),
                images: discogsRelease.thumb
                    ? [
                          {
                              type: 'primary' as const,
                              uri: discogsRelease.cover_image || discogsRelease.thumb,
                              uri150: discogsRelease.thumb,
                              width: 150,
                              height: 150,
                          },
                      ]
                    : undefined,
                uri: `https://www.discogs.com${discogsRelease.uri}`,
                community: discogsRelease.community
                    ? {
                          in_wantlist: discogsRelease.community.want || 0,
                          in_collection: discogsRelease.community.have || 0,
                      }
                    : undefined,
            }
        }

        // Add MusicBrainz data if available and has meaningful content
        if (enrichedResult.musicbrainz) {
            const mb = enrichedResult.musicbrainz
            const hasRecordingData = mb.recording && Object.keys(mb.recording).length > 0
            const hasReleaseData = mb.release && Object.keys(mb.release).length > 0
            const hasArtistsData = mb.artists && mb.artists.length > 0

            if (hasRecordingData || hasReleaseData || hasArtistsData) {
                enhancedResult.musicbrainz = {
                    recording: hasRecordingData
                        ? {
                              id: mb.recording.id,
                              title: mb.recording.title,
                              length: mb.recording.length,
                              disambiguation: mb.recording.disambiguation,
                          }
                        : undefined,
                    artists: hasArtistsData
                        ? mb.artists.map((artist: any) => ({
                              id: artist.id,
                              name: artist.name,
                              'sort-name': artist['sort-name'],
                              disambiguation: artist.disambiguation,
                          }))
                        : undefined,
                    release: hasReleaseData
                        ? {
                              id: mb.release.id,
                              title: mb.release.title,
                              date: mb.release.date,
                              country: mb.release.country,
                          }
                        : undefined,
                    'release-group':
                        mb['release-group'] && Object.keys(mb['release-group']).length > 0
                            ? {
                                  id: mb['release-group'].id,
                                  title: mb['release-group'].title,
                                  'primary-type': mb['release-group']['primary-type'],
                                  'secondary-types': mb['release-group']['secondary-types'],
                              }
                            : undefined,
                    labels: mb.labels && mb.labels.length > 0 ? mb.labels : undefined,
                }
            }
        }

        setResult(enhancedResult)
        toast.success('Song Recognized! 🎵', {
            description: `${recognition.title} by ${recognition.artist}`,
        })
        setIsLoading(false)
    }

    const recognizeSong = async (audioBlob: Blob) => {
        const ndk = ndkActions.getNDK()
        setIsLoading(true)
        setPaymentStatus('idle')

        try {
            const blossomUrl = await uploadToBlossom(audioBlob)
            const dvmcpService = createDVMCPService(ndk!)

            // Set up payment handler to use our NWC payment function
            dvmcpService.setPaymentHandler(async (amount: string, invoice: string) => {
                console.log('[DVMCP Integration] Payment requested:', { amount, invoice })
                try {
                    const success = await processNwcPayment(invoice, amount)
                    console.log('[DVMCP Integration] Payment result:', success)
                    return success
                } catch (error) {
                    console.error('[DVMCP Integration] Payment failed:', error)
                    return false
                }
            })

            // The DVMCP service now returns enriched data directly
            const enrichedResult = await dvmcpService.recognizeSong(blossomUrl)
            await handleRecognitionResult(enrichedResult)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            console.log('Recognition error:', error)
            console.log('Error message:', errorMessage)
            if (errorMessage.includes('Payment required:')) {
                const match = errorMessage.match(/Payment required: (\d+) sats/)
                const amount = match ? match[1] : '0'
                const invoice = (error as any).invoice || ''
                console.log('Extracted amount:', amount)
                console.log('Extracted invoice:', invoice)
                console.log('Full error object:', error)
                requestPayment(amount, invoice)
            } else {
                toast.error('Recognition Failed', { description: errorMessage })
            }
        } finally {
            setIsLoading(false)
        }
    }

    return {
        isLoading,
        result,
        setResult,
        paymentStatus,
        recognizeSong,
        processNwcPayment,
        paymentAmount,
        paymentInvoice,
    }
}
