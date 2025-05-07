import { type ReactNode } from 'react'

interface ExternalLinkProps {
    href: string
    children: ReactNode
    className?: string
    'aria-label'?: string
}

export function ExternalLink({ href, children, className, 'aria-label': ariaLabel, ...props }: ExternalLinkProps) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
            aria-label={ariaLabel}
            {...props}
        >
            {children}
        </a>
    )
}
