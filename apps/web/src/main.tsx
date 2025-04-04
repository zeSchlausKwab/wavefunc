import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { authActions } from './lib/store/auth'
import { routeTree } from './routeTree.gen'
import { ndkActions } from './lib/store/ndk'
import { DEFAULT_RELAYS } from '@wavefunc/common'

const connectToRelay = async () => {
    const localMachineIp = import.meta.env.VITE_PUBLIC_HOST || window.location.hostname
    const wsProtocol = import.meta.env.DEV ? 'ws' : 'wss'
    const relayPrefix = import.meta.env.DEV ? '' : 'relay.'
    const PORT_OR_DEFAULT = import.meta.env.DEV ? ':3002' : ''
    const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`

    console.log(`Adding relay from config: ${relay}`)
    ndkActions.initialize([...DEFAULT_RELAYS, relay])
    // ndkActions.initialize([relay])
    await ndkActions.connect()
    authActions.getAuthFromLocalStorageAndLogin()
}

connectToRelay().catch(console.error)

// Create router and query client before connecting to NDK
const queryClient = new QueryClient()
const router = createRouter({
    routeTree,
    context: {
        queryClient,
    },
})

// Register router for type-safety
declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

// Render the application
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement)
    root.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </StrictMode>,
    )
}
