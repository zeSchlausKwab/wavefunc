import { useState } from 'react'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Textarea } from '@wavefunc/ui/components/ui/textarea'
import { useCreateComment } from '../../queries'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
interface CreateCommentProps {
    stationEvent: any // NDKEvent, avoiding direct import
    onCommentPosted: () => void
}

export default function CreateComment({ stationEvent, onCommentPosted }: CreateCommentProps) {
    const [content, setContent] = useState('')

    const createComment = useCreateComment({
        onSuccess: () => {
            setContent('')
            onCommentPosted()
            toast.success('Comment posted')
        },
        onError: (error) => {
            toast.error('Failed to post comment')
            console.error(error)
        },
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!content.trim() || createComment.isPending) return

        createComment.mutate({
            content: content.trim(),
            stationEvent,
            eventId: stationEvent.id,
        })
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
                        disabled={!content.trim() || createComment.isPending}
                        className="flex items-center gap-2"
                    >
                        {createComment.isPending ? (
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
