import { useState } from 'react'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Textarea } from '@wavefunc/ui/components/ui/textarea'
import { Badge } from '@wavefunc/ui/components/ui/badge'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { ndkActions } from '../lib/store/ndk'
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import type { RecognitionResult } from '../types/recognition'

interface RecognitionResultShareProps {
    result: RecognitionResult
    stationUrl: string
}

export function RecognitionResultShare({ result, stationUrl }: RecognitionResultShareProps) {
    const [text, setText] =
        useState(`🎵 Just discovered this track on wavefunc.live 🎵

🎤 Artist: ${result.artist}
🎶 Title: ${result.title}${result.album ? `
💿 Album: ${result.album}` : ''}${result.release_date ? `
🏷️ Release Date: ${result.release_date}` : ''}

${result.youtube_link ? `${result.youtube_link}` : ''}

🔥 Found using #wavefunc music recognition on station:

${stationUrl}
`)
    const [tags, setTags] = useState<string[]>(['wavefunc', 'music'])
    const [isPublishing, setIsPublishing] = useState(false)

    const removeTag = (tagToRemove: string) => {
        setTags(tags.filter((tag) => tag !== tagToRemove))
    }

    const publishNote = async () => {
        const ndk = ndkActions.getNDK()
        if (!ndk) {
            toast.error('NDK not initialized')
            return
        }

        setIsPublishing(true)
        try {
            const event = new NDKEvent(ndk)
            event.kind = NDKKind.Text
            event.content = text
            event.tags = tags.map((t) => ['t', t])

            await event.sign()
            await event.publish()

            toast.success('Note published successfully!')
        } catch (error) {
            toast.error('Failed to publish note')
            console.error(error)
        } finally {
            setIsPublishing(false)
        }
    }

    return (
        <div className="mt-4">
            <Textarea
                value={text}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
                rows={4}
                className="mb-2"
            />
            <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="flex items-center">
                        #{tag}
                        <Button variant="ghost" size="sm" className="ml-1 p-0 h-auto" onClick={() => removeTag(tag)}>
                            <X className="h-3 w-3" />
                        </Button>
                    </Badge>
                ))}
            </div>
            <Button onClick={publishNote} disabled={isPublishing}>
                {isPublishing ? 'Publishing...' : 'Publish to Nostr'}
            </Button>
        </div>
    )
}
