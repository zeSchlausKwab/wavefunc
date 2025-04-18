import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createCommentEvent, publishComment } from '@wavefunc/common'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ndkActions } from '@wavefunc/common'
interface CreateCommentProps {
    stationEvent: any // NDKEvent, avoiding direct import
    onCommentPosted: () => void
}

export default function CreateComment({ stationEvent, onCommentPosted }: CreateCommentProps) {
    const [content, setContent] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!content.trim() || isSubmitting) return

        setIsSubmitting(true)

        try {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            // Create an unsigned event for a root comment
            const commentEvent = createCommentEvent(content.trim(), stationEvent)

            // Publish the comment
            await publishComment(ndk, commentEvent)

            setContent('')
            onCommentPosted()
            toast.success('Comment posted')
        } catch (error) {
            toast.error('Failed to post comment')
            console.error(error)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold">Add a comment</h3>

            <form onSubmit={handleSubmit} className="space-y-4">
                <Textarea
                    placeholder="Share your thoughts..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-24 resize-none"
                />

                <div className="flex justify-end">
                    <Button
                        type="submit"
                        disabled={!content.trim() || isSubmitting}
                        className="flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Posting...
                            </>
                        ) : (
                            'Post Comment'
                        )}
                    </Button>
                </div>
            </form>
        </div>
    )
}
