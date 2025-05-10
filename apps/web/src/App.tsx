import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { DEFAULT_RELAYS } from '@wavefunc/common'
import { StrictMode, useEffect, useState } from 'react'
import '../styles/index.css'
import { createQueryClient } from '@wavefunc/common'
import type { AppRouterContext, EnvConfig } from '@wavefunc/common'
import { authActions } from '@wavefunc/common'
import { ndkActions } from '@wavefunc/common'
import { walletActions } from '@wavefunc/common'
import { routeTree } from './routeTree.gen'
import { envActions } from '@wavefunc/common'

const loadEnvAndNdk = async (env: EnvConfig) => {
    const localMachineIp = env.VITE_PUBLIC_HOST || window.location.hostname
    const wsProtocol = env.VITE_PUBLIC_APP_ENV === 'development' ? 'ws' : 'wss'
    const relayPrefix = env.VITE_PUBLIC_APP_ENV === 'development' ? '' : 'relay.'
    const PORT_OR_DEFAULT = env.VITE_PUBLIC_APP_ENV === 'development' ? ':3002' : ''
    const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`

    console.log(`Adding relay from config: ${relay}`)

    // Ensure the relays are properly initialized and connected
    const ndk = ndkActions.initialize([...DEFAULT_RELAYS])

    // Initialize the search NDK with the local relay
    ndkActions.initializeSearchNdk(['wss://relay.wavefunc.live'])

    // Connect to relays
    try {
        await ndkActions.connect()
        await ndkActions.connectSearchNdk()

        // Verify that we have connected to at least the local relay
        setTimeout(() => {
            const relays = ndkActions.getRelays()
            const localRelayConnected = relays.some((r) => r.url === relay)
            if (!localRelayConnected) {
                console.warn('Local relay not connected - attempting to reconnect')
                ndkActions.addRelay(relay)
                ndkActions.connect()
            }
        }, 2000)
    } catch (err) {
        console.error('Error connecting to relays:', err)
    }

    // Try to reconnect wallet if it exists
    await walletActions.reconnectFromStorage(ndk).catch((err) => {
        console.error('Failed to reconnect wallet', err)
    })

    authActions.getAuthFromLocalStorageAndLogin()
}

function createAppRouter(queryClient: QueryClient, env: EnvConfig) {
    return createRouter({
        routeTree,
        context: {
            queryClient,
            env,
        } as AppRouterContext,
        defaultPreload: 'intent',
        defaultPreloadStaleTime: 0,
    })
}

export default function App() {
    const [queryClient, setQueryClient] = useState<QueryClient | null>(null)
    const [router, setRouter] = useState<any | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const initialize = async () => {
            console.log('Initializing application...')
            try {
                setIsLoading(true)

                // Initialize environment using the env store
                const envConfig = await envActions.initialize()

                // Initialize NDK with environment
                await loadEnvAndNdk(envConfig)

                const client = await createQueryClient()
                setQueryClient(client)

                const appRouter = createAppRouter(client, envConfig)
                setRouter(appRouter)
            } catch (err) {
                console.error('Initialization error:', err)
                setError(err instanceof Error ? err.message : 'Unknown error during initialization')
            } finally {
                setIsLoading(false)
            }
        }

        initialize()
    }, [])

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen">Initializing application...</div>
    }

    if (error) {
        return (
            <div className="flex justify-center items-center h-screen flex-col gap-2">
                <div className="text-red-500">Error: {error}</div>
                <button className="px-4 py-2 bg-blue-500 text-white rounded" onClick={() => window.location.reload()}>
                    Retry
                </button>
            </div>
        )
    }

    if (!queryClient || !router) {
        return <div className="flex justify-center items-center h-screen">Failed to initialize application</div>
    }

    return (
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </StrictMode>
    )
}
