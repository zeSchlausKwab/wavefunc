import { useId } from 'react'
import { cn } from '@/lib/utils'

interface DotPatternProps {
    width?: number
    height?: number
    x?: number
    y?: number
    cx?: number
    cy?: number
    cr?: number
    className?: string
}

export function DotPattern({
    width = 40,
    height = 40,
    x = 0,
    y = 0,
    cx = 1,
    cy = 1,
    cr = 0.8,
    className,
    ...props
}: DotPatternProps) {
    const id = useId()

    return (
        <svg
            aria-hidden="true"
            className={cn(
                'pointer-events-none absolute inset-0 h-full w-full fill-zinc-300/30 dark:fill-zinc-600/30',
                className,
            )}
            {...props}
        >
            <defs>
                <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
                    <circle cx={cx} cy={cy} r={cr} />
                </pattern>
            </defs>
            <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
        </svg>
    )
}
