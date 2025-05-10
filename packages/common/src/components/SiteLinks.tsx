'use client'

import { Button } from '@wavefunc/ui/components/ui/button'
import { Github, Radio } from 'lucide-react'
import { ExternalLink } from './ExternalLink'

export function SiteLinks() {
    const githubUrl = 'https://github.com/zeSchlausKwab/wavefunc'
    const nostrUrl = `https://njump.me/npub1yy8nrdspnadwz0yetjxc874yrgff7y5ksshycvcn4w9y4wcf6x3qdqlqpp` // Replace 'mock' with actual Nostr ID when available

    return (
        <div className="flex items-center gap-3 mr-2 hidden sm:flex">
            {/* GitHub Link */}
            <ExternalLink href={githubUrl} aria-label="GitHub Repository">
                <Button variant="link" size="icon">
                    <Github className="h-4 w-4" />
                </Button>
            </ExternalLink>

            {/* Nostr Link */}
            <ExternalLink href={nostrUrl} aria-label="Nostr Profile">
                <Button variant="link" size="icon">
                    <Radio className="h-4 w-4" />
                </Button>
            </ExternalLink>
        </div>
    )
}
