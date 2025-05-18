import { createFileRoute } from '@tanstack/react-router'
import Shoutbox from '@wavefunc/common/src/components/comments/Shoutbox'

export const Route = createFileRoute('/community')({
    component: Community,
})

function Community() {
    return (
        <div>
            <Shoutbox />
        </div>
    )
}
