import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { LandingPageContainer } from '@wavefunc/common/src/containers/LandingPageContainer'

export const Route = createFileRoute('/')({
    component: Index,
})

function Index() {
    const { env: routeEnvConfig } = useRouteContext({ from: Route.id })
    // console.log('envConfig from route context in web/index.tsx:', routeEnvConfig)
    return <LandingPageContainer appPubKey={routeEnvConfig?.APP_PUBKEY} />
}
