import { createFileRoute } from '@tanstack/react-router'
import Shoutbox from '@wavefunc/common/src/components/comments/Shoutbox'

export const Route = createFileRoute('/community')({
    component: Community,
})

function Community() {
    return (
        <div className="container max-w-3xl py-10">
            <h1 className="text-3xl font-bold mb-8">Community</h1>
            <p>
                Wavefunc is a community-driven platform. We welcome you to join the community and help us build the
                future of the internet. If you have any questions, please contact us on our{' '}
            </p>
            <Shoutbox />
        </div>
    )
} 