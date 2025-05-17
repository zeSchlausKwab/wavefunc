import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { createQueryClient, envActions, initializeAppCore, type EnvConfig } from '@wavefunc/common'
import { StrictMode, useEffect, useState } from 'react'
import { routeTree } from './routeTree.gen'

// Import required styles
import './styles/index.css'

// Declare the module for type safety if not already declared globally or in a central types file
declare module '@tanstack/react-router' {
    interface Register {
        router: ReturnType<typeof createAppRouterForDevice>
    }
}

// Create router factory
function createAppRouterForDevice(queryClient: QueryClient, env: EnvConfig) {
    return createRouter({
        routeTree,
        context: {
            queryClient,
            env,
        },
        defaultPreload: 'intent',
        defaultPreloadStaleTime: 0,
    })
}

function App() {
    const [queryClient, setQueryClient] = useState<QueryClient | null>(null)
    const [router, setRouter] = useState<ReturnType<typeof createAppRouterForDevice> | null>(null)
    const [envConfig, setEnvConfig] = useState<EnvConfig | null>(null)
    const [isEnvInitialized, setIsEnvInitialized] = useState(false)
    const [isAppCoreInitialized, setIsAppCoreInitialized] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // For debugging env vars from Vite
    console.log('[DevicesApp] Initial import.meta.env:', JSON.stringify(import.meta.env, null, 2))

    // Phase 1: Initialize Environment Configuration
    useEffect(() => {
        if (isEnvInitialized) return
        console.log('[DevicesApp] Phase 1: Initializing Environment Configuration...')
        try {
            // Cast import.meta.env to EnvConfig. Ensure your .env file (via Vite) provides the necessary VITE_ prefixed variables.
            const viteEnv = import.meta.env as any as EnvConfig

            // Optional: Check for a critical variable to ensure .env files are loaded correctly
            if (viteEnv.VITE_APP_PUBKEY === undefined) {
                console.warn('[DevicesApp] VITE_APP_PUBKEY is undefined. Check .env file and Vite config (envDir).')
                // You might choose to setError here or let dependent components handle the missing value.
            }

            envActions.setEnv(viteEnv) // Store it globally if common modules read from envStore
            setEnvConfig(viteEnv)
            setIsEnvInitialized(true)
            console.log('[DevicesApp] Phase 1: Environment Configuration Initialized.', viteEnv)
        } catch (err) {
            console.error('[DevicesApp] Environment Initialization error:', err)
            setError(err instanceof Error ? err.message : 'Unknown error during environment initialization')
        }
    }, [isEnvInitialized])

    // Phase 2: Initialize Core App (NDK, QueryClient, Router) - depends on envConfig
    useEffect(() => {
        const initializeCore = async () => {
            if (!isEnvInitialized || !envConfig || isAppCoreInitialized) {
                if (!isEnvInitialized || !envConfig)
                    console.log('[DevicesApp] Phase 2: Waiting for environment to initialize...')
                else if (isAppCoreInitialized) console.log('[DevicesApp] Phase 2: Core already initialized.')
                return
            }
            console.log('[DevicesApp] Phase 2: Initializing Core Application...')
            try {
                // Relays for devices app can be configured via .env file (e.g., VITE_DEVICES_INITIAL_RELAYS)
                // These are picked up by initializeAppCore if present in envConfig
                await initializeAppCore({ env: envConfig })

                const client = await createQueryClient()
                setQueryClient(client)

                const appRouter = createAppRouterForDevice(client, envConfig)
                setRouter(appRouter)
                setIsAppCoreInitialized(true)
                console.log('[DevicesApp] Phase 2: Core Application Initialized.')
            } catch (err) {
                console.error('[DevicesApp] Core Application Initialization error:', err)
                setError(err instanceof Error ? err.message : 'Unknown error during core app initialization')
            }
        }
        initializeCore()
    }, [isEnvInitialized, envConfig, isAppCoreInitialized])

    if (!isEnvInitialized || !isAppCoreInitialized) {
        const message = !isEnvInitialized
            ? 'Initializing environment (Devices)...'
            : 'Initializing application core (Devices)...'
        return <div className="flex justify-center items-center h-screen text-xl">{message}</div>
    }

    if (error) {
        return (
            <div className="flex justify-center items-center h-screen flex-col gap-2 p-4 text-center">
                <h2 className="text-2xl text-red-600 font-semibold">Application Error (Devices)</h2>
                <p className="text-red-500 bg-red-100 p-3 rounded-md">Error: {error}</p>
                <p className="text-sm text-gray-500">
                    Please check the console for more details and try restarting the application.
                </p>
            </div>
        )
    }

    if (!queryClient || !router) {
        return (
            <div className="flex justify-center items-center h-screen text-xl">
                Failed to initialize critical application components (Devices).
            </div>
        )
    }

    return (
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </StrictMode>
    )
}

export default App
