import { useCreateShoutboxPost } from '@wavefunc/common'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wavefunc/ui/components/ui/select'
import { Textarea } from '@wavefunc/ui/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

export interface CategoryOption {
    value: string
    label: string
}

interface ShoutboxCommentProps {
    onCommentPosted: () => void
    categories: CategoryOption[]
}

export default function ShoutboxComment({ onCommentPosted, categories }: ShoutboxCommentProps) {
    const [content, setContent] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]?.value || '')

    // Use the new shoutbox post mutation hook
    const createShoutboxPostMutation = useCreateShoutboxPost({
        onSuccess: () => {
            setContent('')
            setSelectedCategory(categories[0]?.value || '')
            onCommentPosted()
            toast.success('Posted to shoutbox')
        },
        onError: (error) => {
            toast.error('Failed to post to shoutbox')
            console.error(error)
        },
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!content.trim() || createShoutboxPostMutation.isPending) return

        createShoutboxPostMutation.mutate({
            content: content.trim(),
            category: selectedCategory,
        })
    }

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold">Post to Shoutbox</h3>

            <form onSubmit={handleSubmit} className="space-y-4">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                        {categories.map((category) => (
                            <SelectItem key={category.value} value={category.value}>
                                {category.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Textarea
                    placeholder="What's on your mind?"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-24 resize-none"
                />

                <div className="flex justify-end">
                    <Button
                        type="submit"
                        disabled={!content.trim() || createShoutboxPostMutation.isPending || !selectedCategory}
                        className="flex items-center gap-2"
                    >
                        {createShoutboxPostMutation.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Posting...
                            </>
                        ) : (
                            'Post to Shoutbox'
                        )}
                    </Button>
                </div>
            </form>
        </div>
    )
}
