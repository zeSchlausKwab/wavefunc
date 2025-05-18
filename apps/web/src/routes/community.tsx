import { createFileRoute } from '@tanstack/react-router'
import Shoutbox from '@wavefunc/common/src/components/comments/Shoutbox'

export const Route = createFileRoute('/community')({
    component: Community,
})

function Community() {
    return (
        <div className="container max-w-5xl py-10">
            <Shoutbox />
        </div>
    )
}
