import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import type { AppRouterContext, EnvConfig } from '@wavefunc/common'
import { authActions, createQueryClient, DEFAULT_RELAYS, envActions, ndkActions, walletActions } from '@wavefunc/common'
import { StrictMode, useEffect, useState } from 'react'
import '../styles/index.css'
import { routeTree } from './routeTree.gen'

// Helper to check if running in browser
const isBrowser = typeof window !== 'undefined'

const loadEnvAndNdk = async (env: EnvConfig) => {
    const localMachineIp = env.VITE_PUBLIC_HOST || (isBrowser ? window.location.hostname : 'localhost')
    const wsProtocol = env.VITE_PUBLIC_APP_ENV === 'development' ? 'ws' : 'wss'
    const relayPrefix = env.VITE_PUBLIC_APP_ENV === 'development' ? '' : 'relay.'
    const PORT_OR_DEFAULT = env.VITE_PUBLIC_APP_ENV === 'development' ? ':3002' : ''
    const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`

    // Ensure the relays are properly initialized and connected
    const ndk = ndkActions.initialize([...DEFAULT_RELAYS])
    // const ndk = ndkActions.initialize([relay])

    // Initialize the search NDK with the local relay
    // ndkActions.initializeSearchNdk(['wss://relay.wavefunc.live'])
    ndkActions.initializeSearchNdk([relay])

    // Connect to relays only if not already connected
    try {
        const ndkState = ndkActions.getState()

        // Only connect main NDK if not already connected
        if (!ndkState.isConnected && !ndkState.isConnecting) {
            console.log('Connecting to main NDK')
            await ndkActions.connect()
        } else {
            console.log('Main NDK is already connected or connecting')
        }

        // Only connect search NDK if not already connected
        const searchState = ndkState.searchNdk
        if (searchState && !searchState.isConnected && !searchState.isConnecting) {
            console.log('Connecting to search NDK')
            await ndkActions.connectSearchNdk()
        } else if (!searchState) {
            console.log('Search NDK state not found, skipping connection.')
        } else {
            console.log('Search NDK is already connected or connecting')
        }

        // Verify local relay connection - but only attempt once
        if (isBrowser) {
            setTimeout(() => {
                const relays = ndkActions.getRelays()
                const localRelayConnected = relays.some((r) => r.url === relay)
                if (!localRelayConnected) {
                    console.warn('Local relay not connected - adding to relay list')
                    ndkActions.addRelay(relay)
                    // Don't call connect again, just add the relay - it will be used on next reconnect
                }
            }, 2000)
        }
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

interface AppProps {
    initialEnvConfig?: EnvConfig
}

export default function App({ initialEnvConfig }: AppProps) {
    const [queryClient, setQueryClient] = useState<QueryClient | null>(null)
    const [router, setRouter] = useState<any | null>(null)
    const [envConfig, setEnvConfig] = useState<EnvConfig | null>(initialEnvConfig || null)
    const [isEnvInitialized, setIsEnvInitialized] = useState(false)
    const [isAppCoreInitialized, setIsAppCoreInitialized] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Effect 1: Initialize Environment Configuration
    useEffect(() => {
        const initializeEnv = async () => {
            console.log('Phase 1: Initializing Environment Configuration...')
            if (isEnvInitialized) {
                // Prevent re-running if already initialized
                console.log('Environment already initialized, skipping.')
                return
            }
            try {
                let resolvedEnvConfig: EnvConfig
                if (initialEnvConfig) {
                    console.log('Using initialEnvConfig from SSR')
                    resolvedEnvConfig = initialEnvConfig
                } else {
                    console.log('Attempting to load envConfig on client')
                    let preloadedEnv: EnvConfig | null = null
                    if (isBrowser) {
                        const preloadedEnvScript = document.getElementById('env-config-hydration')
                        if (preloadedEnvScript?.textContent) {
                            try {
                                preloadedEnv = JSON.parse(preloadedEnvScript.textContent)
                                console.log('Using envConfig from hydration script')
                            } catch (e) {
                                console.error('Failed to parse preloaded env config from script', e)
                            }
                        }
                    }
                    if (preloadedEnv) {
                        resolvedEnvConfig = preloadedEnv
                    } else {
                        console.log('Fetching envConfig via envActions.initialize()')
                        resolvedEnvConfig = await envActions.initialize() // Fallback to fetch
                    }
                }

                if (resolvedEnvConfig) {
                    envActions.setEnv(resolvedEnvConfig) // Set in global store immediately
                    setEnvConfig(resolvedEnvConfig) // Set in local state for dependent effects
                    setIsEnvInitialized(true)
                    console.log('Phase 1: Environment Configuration Initialized.', resolvedEnvConfig)
                } else {
                    throw new Error('Environment configuration could not be resolved.')
                }
            } catch (err) {
                console.error('Environment Initialization error:', err)
                setError(err instanceof Error ? err.message : 'Unknown error during environment initialization')
            }
        }

        if (!envConfig) {
            // Only run if envConfig is not yet set (e.g. by initialEnvConfig prop)
            initializeEnv()
        } else {
            // If initialEnvConfig was provided, set it in the store and mark env as initialized
            envActions.setEnv(envConfig)
            setIsEnvInitialized(true)
            console.log('Phase 1: Environment Configuration Initialized using prop.', envConfig)
        }
    }, [initialEnvConfig, envConfig, isEnvInitialized]) // Added envConfig & isEnvInitialized to prevent re-runs if initialEnvConfig changes but envConfig is already set

    // Effect 2: Initialize Core App (NDK, QueryClient, Router) - depends on envConfig
    useEffect(() => {
        const initializeCoreApp = async () => {
            if (!isEnvInitialized || !envConfig || isAppCoreInitialized) {
                // Ensure env is ready and not already initialized
                if (isAppCoreInitialized) console.log('Core app already initialized, skipping.')
                else if (!isEnvInitialized || !envConfig)
                    console.log('Waiting for env to be initialized before starting core app setup.')
                return
            }

            console.log('Phase 2: Initializing Core Application (NDK, QueryClient, Router)...')
            try {
                await loadEnvAndNdk(envConfig) // NDK setup now uses the resolved envConfig

                const client = await createQueryClient()
                setQueryClient(client)

                const appRouter = createAppRouter(client, envConfig)
                setRouter(appRouter)
                setIsAppCoreInitialized(true)
                console.log('Phase 2: Core Application Initialized.')
            } catch (err) {
                console.error('Core Application Initialization error:', err)
                setError(err instanceof Error ? err.message : 'Unknown error during core app initialization')
            }
        }

        initializeCoreApp()
    }, [isEnvInitialized, envConfig, isAppCoreInitialized]) // Depends on envConfig and its initialization status

    if (!isEnvInitialized || !isAppCoreInitialized) {
        const message = !isEnvInitialized ? 'Initializing environment...' : 'Initializing application core...'
        return <div className="flex justify-center items-center h-screen">{message}</div>
    }

    if (error) {
        return (
            <div className="flex justify-center items-center h-screen flex-col gap-2">
                <div className="text-red-500">Error: {error}</div>
                {isBrowser && (
                    <button
                        className="px-4 py-2 bg-blue-500 text-white rounded"
                        onClick={() => window.location.reload()}
                    >
                        Retry
                    </button>
                )}
            </div>
        )
    }

    if (!queryClient || !router) {
        return (
            <div className="flex justify-center items-center h-screen">Failed to initialize application components</div>
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
