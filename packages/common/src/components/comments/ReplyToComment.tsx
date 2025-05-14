import { useState } from 'react'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Textarea } from '@wavefunc/ui/components/ui/textarea'
import { createCommentEvent, publishComment } from '@wavefunc/common'
import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { NDKKind } from '@nostr-dev-kit/ndk'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { ndkActions } from '@wavefunc/common'

interface ReplyToCommentProps {
    stationEvent: NDKEvent
    parentComment: NDKEvent
    onCommentPosted: () => void
    onClose?: () => void
}

export default function ReplyToComment({ stationEvent, parentComment, onCommentPosted, onClose }: ReplyToCommentProps) {
    const [content, setContent] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!content.trim() || isSubmitting) return

        setIsSubmitting(true)

        try {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            const commentEvent = createCommentEvent(content.trim(), stationEvent, parentComment)

            const isShoutboxContext = stationEvent.tags.some((tag) => tag[0] === 't' && tag[1] === 'shoutbox')
            if (isShoutboxContext) {
                commentEvent.tags.push(['t', 'wavefunc'])
                commentEvent.tags.push(['t', 'shoutbox'])
                if (parentComment.kind === NDKKind.Text) {
                    const parentCategoryTag = parentComment.tags.find(
                        (tag: string[]) =>
                            tag[0] === 't' && ['bug', 'suggestion', 'greeting', 'general'].includes(tag[1]),
                    )
                    if (parentCategoryTag) {
                        if (!commentEvent.tags.some((t: string[]) => t[0] === 't' && t[1] === parentCategoryTag[1])) {
                            commentEvent.tags.push([...parentCategoryTag])
                        }
                    }
                }
            }

            await publishComment(ndk, commentEvent)

            setContent('')
            onCommentPosted()
            if (onClose) onClose()
            toast.success('Reply posted')
        } catch (error) {
            toast.error('Failed to post reply')
            console.error(error)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="bg-card p-3 rounded-md border shadow-sm">
            <div className="flex justify-between items-center mb-2">
                <p className="text-xs text-muted-foreground">
                    Replying to {parentComment.author?.profile?.name || parentComment.pubkey.slice(0, 12) + '...'}
                </p>
                {onClose && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                            e.preventDefault()
                            onClose()
                        }}
                        disabled={isSubmitting}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write a reply..."
                className="resize-none mb-2 text-sm"
                rows={3}
                disabled={isSubmitting}
            />

            <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!content.trim() || isSubmitting}>
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Posting...
                        </>
                    ) : (
                        'Post Reply'
                    )}
                </Button>
            </div>
        </form>
    )
}
