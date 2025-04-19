import { useId } from 'react'
import { cn } from '@wavefunc/common'

interface CheckerPatternProps {
    size?: number
    className?: string
}

export function CheckerPattern({ size = 20, className, ...props }: CheckerPatternProps) {
    const id = useId()

    return (
        <svg
            aria-hidden="true"
            className={cn(
                'pointer-events-none absolute inset-0 h-full w-full fill-zinc-300/20 dark:fill-zinc-600/20',
                className,
            )}
            {...props}
        >
            <defs>
                <pattern
                    id={id}
                    width={size * 2}
                    height={size * 2}
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(0)"
                >
                    <rect width={size} height={size} x={0} y={0} />
                    <rect width={size} height={size} x={size} y={size} />
                </pattern>
            </defs>
            <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
        </svg>
    )
}
