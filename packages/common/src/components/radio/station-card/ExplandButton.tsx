import { ChevronUp } from 'lucide-react'

import { Button } from '@wavefunc/ui/components/ui/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@wavefunc/common'

// Expand/collapse button component
interface ExpandButtonProps {
    isExpanded: boolean
    setIsExpanded: (expanded: boolean) => void
    isMobile: boolean
    isFullWidth: boolean
}

export const ExpandButton = ({ isExpanded, setIsExpanded, isMobile, isFullWidth }: ExpandButtonProps) => (
    <Button
        variant={isFullWidth ? 'default' : 'ghost'}
        size={isFullWidth ? (isMobile ? 'sm' : 'icon') : 'sm'}
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
            isFullWidth ? (isMobile ? 'px-3 py-1 ml-1 h-8' : 'shrink-0') : 'h-6 px-1',
            isMobile ? 'text-[10px]' : 'text-xs',
        )}
    >
        {(!isFullWidth || isMobile) && (isExpanded ? 'Less' : 'More')}
        {isExpanded ? (
            <ChevronUp className={cn(isMobile ? 'h-3 w-3 ml-1' : 'h-4 w-4')} />
        ) : (
            <ChevronDown className={cn(isMobile ? 'h-3 w-3 ml-1' : 'h-4 w-4')} />
        )}
    </Button>
)
