import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { LandingPageContainer } from '@wavefunc/common/src/containers/LandingPageContainer'

export const Route = createFileRoute('/')({
    component: Index,
})

function Index() {
    const { env: routeEnvConfig } = useRouteContext({ from: Route.id })
    return <LandingPageContainer appPubKey={routeEnvConfig?.VITE_APP_PUBKEY} />
}
