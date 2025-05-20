import { createFileRoute } from '@tanstack/react-router'
import { DiscoverPageContainer } from '@wavefunc/common/src/containers/DiscoverPageContainer'
export const Route = createFileRoute('/discover')({
    component: Index,
})

function Index() {
    return <DiscoverPageContainer />
}
