import { cn } from '@wavefunc/common'
import { Badge } from '@wavefunc/ui/components/ui/badge'
// Component for station tags display
interface StationTagsProps {
    tags: string[]
    isMobile: boolean
}

export const StationTags = ({ tags, isMobile }: StationTagsProps) => {
    if (!tags || tags.length === 0) return null

    return (
        <div className="mt-1 flex flex-wrap gap-0.5 overflow-hidden h-5 text-xs">
            {tags.slice(0, isMobile ? 2 : 3).map((tag: string, index: number) => (
                <Badge key={index} size="xs">
                    {tag}
                </Badge>
            ))}
            {tags.length > (isMobile ? 2 : 3) && (
                <Badge size="xs" className={cn('inline-block bg-gray-100 text-gray-500 rounded')}>
                    +{tags.length - (isMobile ? 2 : 3)}
                </Badge>
            )}
        </div>
    )
}
