import { createFileRoute } from '@tanstack/react-router'
import { LibraryContainer } from '@wavefunc/common'

export const Route = createFileRoute('/library')({
    component: Library,
})

function Library() {
    return <LibraryContainer />
}
