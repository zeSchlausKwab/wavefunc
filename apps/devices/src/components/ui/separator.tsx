import * as React from 'react'
import { cn } from '@wavefunc/common'

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
    orientation?: 'horizontal' | 'vertical'
    decorative?: boolean
}

export function Separator({ className, orientation = 'horizontal', decorative = true, ...props }: SeparatorProps) {
    return (
        <div
            role={decorative ? 'none' : 'separator'}
            aria-orientation={decorative ? undefined : orientation}
            className={cn(
                'shrink-0 bg-border',
                orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
                className,
            )}
            {...props}
        />
    )
}
