import { RouterProvider } from '@tanstack/react-router'
import { authActions, DEFAULT_RELAYS, ndkActions, walletActions, createQueryClient } from '@wavefunc/common'
import { useEffect, useState } from 'react'
import { router } from './routeConfig'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Import required styles
import '@wavefunc/ui/index.css'

const loadEnvAndNdk = async () => {
    const ndk = ndkActions.initialize([...DEFAULT_RELAYS, 'ws://192.168.100.99:3002'])
    await ndkActions.connect()

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

    // The entire app is rendered inside QueryClientProvider and RouterProvider
    return (
        <div className="app">
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </div>
    )
}

export default App
