import { Button } from '@wavefunc/ui/components/ui/button'
import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface ShareStationButtonProps {
    stationId: string
    stationName: string
    className?: string
    naddr: string
}

export function ShareStationButton({ stationId, stationName, className = '', naddr }: ShareStationButtonProps) {
    const [isSharing, setIsSharing] = useState(false)

    // Fallback function to copy text when Clipboard API is not available
    const fallbackCopyTextToClipboard = (text: string) => {
        const textArea = document.createElement('textarea')
        textArea.value = text

        // Make the textarea out of viewport
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)

        // Focus and select the text
        textArea.focus()
        textArea.select()

        let success = false
        try {
            // Execute the copy command
            success = document.execCommand('copy')
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err)
        }

        // Remove the textarea from the document
        document.body.removeChild(textArea)
        return success
    }

    const handleShare = async () => {
        setIsSharing(true)
        try {
            // Just use the current URL directly - no need for og=true anymore
            const shareUrl = window.location.href + 'station/' + naddr

            // Use Web Share API if available
            if (navigator.share) {
                await navigator.share({
                    title: `${stationName} - WaveFunc`,
                    text: `Listen to ${stationName} on WaveFunc!`,
                    url: shareUrl,
                })
                toast.success('Station shared!')
            } else {
                // Try to use Clipboard API first
                let copied = false
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    try {
                        await navigator.clipboard.writeText(shareUrl)
                        copied = true
                    } catch (clipboardError) {
                        console.warn('Clipboard API failed:', clipboardError)
                    }
                }

                // If Clipboard API failed or is not available, use fallback
                if (!copied) {
                    copied = fallbackCopyTextToClipboard(shareUrl)
                }

                if (copied) {
                    toast.success('Share link copied to clipboard!')
                } else {
                    toast.error('Could not copy to clipboard. Please copy the URL manually.')
                    console.log('Share this URL:', shareUrl)
                }
            }
        } catch (error) {
            console.error('Error sharing station:', error)
            toast.error('Failed to share station')
        } finally {
            setIsSharing(false)
        }
    }

    return (
        <Button
            variant="outline"
            size="icon"
            aria-label="Share Station"
            onClick={handleShare}
            disabled={isSharing}
            className={className}
        >
            <Share2 className="h-4 w-4 text-primary" />
        </Button>
    )
}
