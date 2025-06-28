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

        // Check if the data has the expected structure from DVMCP service
        const recognition = enrichedResult.recognition || enrichedResult

        if (!recognition.title || !recognition.artist) {
            throw new Error('Invalid recognition data - missing title or artist')
        }

        // Normalize the data structure to match RecognitionResult interface
        const normalizedResult: RecognitionResult = {
            title: recognition.title,
            artist: recognition.artist,
            album: recognition.album,
            release_date: recognition.release_date,
            song_link: recognition.song_link,
            apple_music: recognition.apple_music,
            spotify: recognition.spotify,
            discogs: enrichedResult.discogs?.results?.[0] || null,
            musicbrainz: enrichedResult.musicbrainz,
        }

        setResult(normalizedResult)
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
