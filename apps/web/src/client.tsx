import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { DEFAULT_RELAYS } from '@wavefunc/common'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/index.css'
import { createQueryClient } from './lib/queryClient'
import type { AppRouterContext } from './lib/router-utils'
import { authActions } from './lib/store/auth'
import { ndkActions } from './lib/store/ndk'
import { walletActions } from './lib/store/wallet'
import { routeTree } from './routeTree.gen'

const loadEnvAndNdk = async () => {
    const env = await fetch('/envConfig').then((res) => res.json())

    const localMachineIp = env.VITE_PUBLIC_HOST || window.location.hostname
    const wsProtocol = env.VITE_PUBLIC_APP_ENV === 'development' ? 'ws' : 'wss'
    const relayPrefix = env.VITE_PUBLIC_APP_ENV === 'development' ? '' : 'relay.'
    const PORT_OR_DEFAULT = env.VITE_PUBLIC_APP_ENV === 'development' ? ':3002' : ''
    const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`

    console.log(`Adding relay from config: ${relay}`)
    const ndk = ndkActions.initialize([...DEFAULT_RELAYS, relay])
    // ndkActions.initialize([relay])
    await ndkActions.connect()

    // Try to reconnect wallet if it exists
    await walletActions.reconnectFromStorage(ndk).catch((err) => {
        console.error('Failed to reconnect wallet', err)
    })

    authActions.getAuthFromLocalStorageAndLogin()
}

// initialize().catch(console.error)

function createAppRouter(queryClient: QueryClient) {
    return createRouter({
        routeTree,
        context: {
            queryClient,
        } as AppRouterContext,
        defaultPreload: 'intent',
        defaultPreloadStaleTime: 0,
    })
}

function App() {
    const [queryClient, setQueryClient] = useState<QueryClient | null>(null)
    const [router, setRouter] = useState<any | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const initialize = async () => {
            console.log('Initializing application...')
            loadEnvAndNdk().catch(console.error)
            try {
                setIsLoading(true)

                const client = await createQueryClient()
                setQueryClient(client)

                const appRouter = createAppRouter(client)

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

const elem = document.getElementById('root')!

if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem))
    root.render(<App />)
} else {
    createRoot(elem).render(<App />)
}
