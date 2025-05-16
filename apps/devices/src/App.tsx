import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { authActions, createQueryClient, DEFAULT_RELAYS, ndkActions, walletActions } from '@wavefunc/common'
import { useEffect, useState } from 'react'
import { routeTree } from './routeTree.gen'

// Import required styles
import './styles/index.css'

// Create router with type assertions to work around type issues
const router = createRouter({
    routeTree,
    context: {
        queryClient: null,
        env: {},
    } as any,
})

// Register router for type-safety
declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

const loadEnvAndNdk = async () => {
    const ndk = ndkActions.initialize([...DEFAULT_RELAYS])
    ndkActions.initializeSearchNdk(['wss://relay.wavefunc.live'])
    await ndkActions.connect()
    await ndkActions.connectSearchNdk()

    // Try to reconnect wallet if it exists
    await walletActions.reconnectFromStorage(ndk).catch((err) => {
        console.error('Failed to reconnect wallet', err)
    })

    authActions.getAuthFromLocalStorageAndLogin()
}

function App() {
    const [queryClient, setQueryClient] = useState<QueryClient | null>(null)

    // Initialize NDK and QueryClient
    useEffect(() => {
        const initialize = async () => {
            await loadEnvAndNdk()
            const client = await createQueryClient()
            setQueryClient(client)
        }

        initialize()

        return () => {
            // NDK cleanup on unmount
            console.log('NDK cleanup')
        }
    }, [])

    // Don't render until QueryClient is ready
    if (!queryClient) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>
    }

    // Provide the router with the context values
    return (
        <QueryClientProvider client={queryClient}>
            <RouterProvider
                router={router}
                context={
                    {
                        queryClient,
                        env: import.meta.env,
                    } as any
                }
            />
        </QueryClientProvider>
    )
}

export default App
