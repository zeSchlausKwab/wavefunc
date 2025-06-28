import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Textarea } from '@wavefunc/ui/components/ui/textarea'
import { Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCreateComment } from '../../queries'

interface ReplyToCommentProps {
    stationEvent: NDKEvent
    parentComment: NDKEvent
    onCommentPosted: () => void
    onClose?: () => void
}

export default function ReplyToComment({ stationEvent, parentComment, onCommentPosted, onClose }: ReplyToCommentProps) {
    const [content, setContent] = useState('')

    const createCommentMutation = useCreateComment({
        onSuccess: () => {
            setContent('')
            onCommentPosted()
            if (onClose) onClose()
            toast.success('Reply posted')
        },
        onError: (error) => {
            toast.error('Failed to post reply')
            console.error(error)
        },
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!content.trim() || createCommentMutation.isPending) return

        createCommentMutation.mutate({
            content: content.trim(),
            stationEvent,
            parentComment,
        })
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
                        disabled={createCommentMutation.isPending}
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
                disabled={createCommentMutation.isPending}
            />

            <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!content.trim() || createCommentMutation.isPending}>
                    {createCommentMutation.isPending ? (
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
