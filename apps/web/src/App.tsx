import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import type { AppRouterContext } from '@wavefunc/common'
import type { EnvConfig } from '@wavefunc/common/src/config/env'
import { useInitialization } from '@wavefunc/common'
import { StrictMode } from 'react'
import '../styles/index.css'
import { routeTree } from './routeTree.gen'

// Helper to check if running in browser
const isBrowser = typeof window !== 'undefined'

function createAppRouter(queryClient: any, env: EnvConfig) {
    return createRouter({
        routeTree,
        context: {
            queryClient,
            env: {
                VITE_PUBLIC_HOST: env.VITE_PUBLIC_HOST || '',
                VITE_PUBLIC_APP_ENV: env.VITE_PUBLIC_APP_ENV || 'development',
                ...env,
            },
        } as AppRouterContext,
        defaultPreload: 'intent',
        defaultPreloadStaleTime: 0,
    })
}

interface AppProps {
    initialEnvConfig?: EnvConfig
}

export default function App({ initialEnvConfig }: AppProps) {
    const initialization = useInitialization({
        initialEnvConfig,
    })

    // Show loading state
    if (!initialization.isInitialized) {
        const getLoadingMessage = () => {
            switch (initialization.phase) {
                case 'environment':
                    return 'Loading environment configuration...'
                case 'ndk':
                    return 'Connecting to Nostr relays...'
                case 'services':
                    return 'Initializing services...'
                default:
                    return 'Starting application...'
            }
        }

        return (
            <div className="flex justify-center items-center h-screen flex-col gap-4">
                <div>{getLoadingMessage()}</div>
                {initialization.progress > 0 && (
                    <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 transition-all duration-300 ease-out"
                            style={{ width: `${initialization.progress}%` }}
                        />
                    </div>
                )}
            </div>
        )
    }

    // Show error state
    if (initialization.error || initialization.result?.error) {
        const error = initialization.error || initialization.result?.error
        return (
            <div className="flex justify-center items-center h-screen flex-col gap-4">
                <div className="text-red-500 text-center">
                    <div className="font-semibold">Initialization Error</div>
                    <div className="text-sm mt-1">{error}</div>
                    {initialization.retryCount > 0 && (
                        <div className="text-xs mt-2 text-gray-500">Attempt {initialization.retryCount + 1} failed</div>
                    )}
                </div>
                {isBrowser && (
                    <div className="flex gap-2">
                        {initialization.canRetry && (
                            <button
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                onClick={initialization.retry}
                            >
                                Retry ({3 - initialization.retryCount} attempts left)
                            </button>
                        )}
                        <button
                            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                            onClick={initialization.forceRetry}
                        >
                            Force Retry
                        </button>
                        <button
                            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                            onClick={() => window.location.reload()}
                        >
                            Reload Page
                        </button>
                    </div>
                )}
            </div>
        )
    }

    // Check if we have the required components
    if (!initialization.result?.queryClient || !initialization.result?.envConfig) {
        return (
            <div className="flex justify-center items-center h-screen">Failed to initialize application components</div>
        )
    }

    const router = createAppRouter(initialization.result.queryClient, initialization.result.envConfig)

    return (
        <StrictMode>
            <QueryClientProvider client={initialization.result.queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </StrictMode>
    )
}
