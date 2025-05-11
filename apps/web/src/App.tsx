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

// Helper to check if running in browser
const isBrowser = typeof window !== 'undefined';

const loadEnvAndNdk = async (env: EnvConfig) => {
    const localMachineIp = env.VITE_PUBLIC_HOST || (isBrowser ? window.location.hostname : 'localhost')
    const wsProtocol = env.VITE_PUBLIC_APP_ENV === 'development' ? 'ws' : 'wss'
    const relayPrefix = env.VITE_PUBLIC_APP_ENV === 'development' ? '' : 'relay.'
    const PORT_OR_DEFAULT = env.VITE_PUBLIC_APP_ENV === 'development' ? ':3002' : ''
    const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`

    // Ensure the relays are properly initialized and connected
    const ndk = ndkActions.initialize([...DEFAULT_RELAYS])

    // Initialize the search NDK with the local relay
    ndkActions.initializeSearchNdk(['wss://relay.wavefunc.live'])

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
            console.log('Search NDK state not found, skipping connection.');
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
    initialEnvConfig?: EnvConfig;
}

export default function App({ initialEnvConfig }: AppProps) {
    const [queryClient, setQueryClient] = useState<QueryClient | null>(null)
    const [router, setRouter] = useState<any | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const initialize = async () => {
            console.log('Initializing application...')
            try {
                setIsLoading(true)

                let envConfigToUse: EnvConfig;
                if (initialEnvConfig) {
                    console.log('Using initialEnvConfig from SSR');
                    envConfigToUse = initialEnvConfig;
                } else {
                    console.log('Fetching envConfig on client');
                    // Check if env config is already loaded by hydration script
                    let preloadedEnv: EnvConfig | null = null;
                    if (isBrowser) {
                        const preloadedEnvScript = document.getElementById('env-config-hydration');
                        if (preloadedEnvScript?.textContent) {
                            try {
                                preloadedEnv = JSON.parse(preloadedEnvScript.textContent);
                                console.log('Using envConfig from hydration script');
                            } catch (e) {
                                console.error('Failed to parse preloaded env config from script', e);
                            }
                        }
                    }
                    if (preloadedEnv) {
                        envConfigToUse = preloadedEnv;
                    } else {
                        envConfigToUse = await envActions.initialize(); // Fallback to fetch
                    }
                }

                // Initialize NDK with environment
                await loadEnvAndNdk(envConfigToUse)

                
                const client = await createQueryClient()
                setQueryClient(client)

                const appRouter = createAppRouter(client, envConfigToUse)
                setRouter(appRouter)
            } catch (err) {
                console.error('Initialization error:', err)
                setError(err instanceof Error ? err.message : 'Unknown error during initialization')
            } finally {
                setIsLoading(false)
            }
        }

        initialize()
    }, [initialEnvConfig]) // Depend on initialEnvConfig

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen">Initializing application...</div>
    }

    if (error) {
        return (
            <div className="flex justify-center items-center h-screen flex-col gap-2">
                <div className="text-red-500">Error: {error}</div>
                {isBrowser && (
                    <button className="px-4 py-2 bg-blue-500 text-white rounded" onClick={() => window.location.reload()}>
                        Retry
                    </button>
                )}
            </div>
        )
    }

    if (!queryClient || !router) {
        return <div className="flex justify-center items-center h-screen">Failed to initialize application components</div>
    }

    return (
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </StrictMode>
    )
}
