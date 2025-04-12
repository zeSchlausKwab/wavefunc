import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
// Component for station tags display
interface StationTagsProps {
    tags: string[]
    isMobile: boolean
}

export const StationTags = ({ tags, isMobile }: StationTagsProps) => {
    if (!tags || tags.length === 0) return null

    return (
        <div className="mt-1 flex flex-wrap gap-1 overflow-hidden h-6">
            {tags.slice(0, isMobile ? 2 : 3).map((tag: string, index: number) => (
                <Badge key={index}>{tag}</Badge>
            ))}
            {tags.length > (isMobile ? 2 : 3) && (
                <Badge className={cn('inline-block bg-gray-100 text-gray-500 rounded-full')}>
                    +{tags.length - (isMobile ? 2 : 3)}
                </Badge>
            )}
        </div>
    )
}
