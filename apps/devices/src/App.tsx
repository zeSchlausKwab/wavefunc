import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { createQueryClient, envActions, type EnvConfig as CoreEnvConfig } from '@wavefunc/common'
import { StrictMode, useEffect, useState } from 'react'
import { routeTree } from './routeTree.gen'

// Import required styles
import './styles/index.css'

// Declare the module for type safety if not already declared globally or in a central types file
declare module '@tanstack/react-router' {
    interface Register {
        router: ReturnType<typeof createAppRouterForDevice>
    }
    interface StaticDataRouteOption {
        env?: CoreEnvConfig
    }
}

// Create router factory
function createAppRouterForDevice(queryClient: QueryClient, env: CoreEnvConfig) {
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
    const [envConfig, setEnvConfig] = useState<CoreEnvConfig | null>(null)
    const [isEnvInitialized, setIsEnvInitialized] = useState(false)
    const [isAppCoreInitialized, setIsAppCoreInitialized] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Phase 1: Initialize Environment Configuration
    useEffect(() => {
        if (isEnvInitialized) return
        console.log('[DevicesApp] Phase 1: Initializing Environment Configuration...')
        try {
            const rawViteEnv = import.meta.env

            // Construct processedEnv, assuming CoreEnvConfig matches Vite's types for standard vars
            const processedEnv: CoreEnvConfig = {
                BASE_URL: rawViteEnv.BASE_URL,
                MODE: rawViteEnv.MODE as 'development' | 'production', // Vite provides these specific strings
                DEV: rawViteEnv.DEV.toString(), // Vite provides boolean
                PROD: rawViteEnv.PROD.toString(), // Vite provides boolean
                SSR: rawViteEnv.SSR.toString(), // Vite provides boolean

                VITE_APP_PUBKEY: rawViteEnv.VITE_APP_PUBKEY,
                VITE_PUBLIC_APP_ENV:
                    rawViteEnv.VITE_PUBLIC_APP_ENV === 'development' || rawViteEnv.VITE_PUBLIC_APP_ENV === 'production'
                        ? rawViteEnv.VITE_PUBLIC_APP_ENV
                        : undefined,
                VITE_PUBLIC_HOST: rawViteEnv.VITE_PUBLIC_HOST,
                VITE_PUBLIC_WEB_PORT: rawViteEnv.VITE_PUBLIC_WEB_PORT,
            }

            // If CoreEnvConfig has [key: string]: any or similar for additional VITE_ vars:
            for (const key in rawViteEnv) {
                if (key.startsWith('VITE_') && !(key in processedEnv)) {
                    ;(processedEnv as any)[key] = rawViteEnv[key]
                }
            }

            if (processedEnv.VITE_APP_PUBKEY === undefined) {
                console.warn('[DevicesApp] VITE_APP_PUBKEY is undefined. Check .env file and Vite config (envDir).')
            }

            envActions.setEnv(processedEnv)
            setEnvConfig(processedEnv)
            setIsEnvInitialized(true)
            console.log('[DevicesApp] Phase 1: Environment Configuration Initialized.', processedEnv)
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
                await initializeAppCore({
                    env: {
                        ...envConfig,
                        VITE_PUBLIC_APP_ENV: envConfig.VITE_PUBLIC_APP_ENV as 'development' | 'production' | undefined,
                    },
                })

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
        if (isEnvInitialized && envConfig && !isAppCoreInitialized) {
            initializeCore()
        }
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
