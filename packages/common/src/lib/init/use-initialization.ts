import { useEffect, useState } from 'react'
import {
    initializationManager,
    type InitializationOptions,
    type InitializationState,
    type InitializationResult,
} from './initialization-manager'

export function useInitialization(options: InitializationOptions = {}) {
    const [state, setState] = useState<InitializationState>(() => initializationManager.getState())
    const [result, setResult] = useState<InitializationResult | null>(null)

    useEffect(() => {
        // Subscribe to state changes
        const unsubscribe = initializationManager.subscribe(setState)

        // Start initialization if not already started
        if (state.phase === 'idle') {
            initializationManager
                .initialize(options)
                .then(setResult)
                .catch((error) => {
                    console.error('Initialization failed:', error)
                    setResult({
                        envConfig: null as any,
                        queryClient: null as any,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    })
                })
        } else if (initializationManager.isReady()) {
            // If already ready, get the current result
            initializationManager.initialize(options).then(setResult)
        }

        return unsubscribe
    }, []) // Only run once on mount

    return {
        ...state,
        result,
        retry: () => {
            if (!state.canRetry) {
                console.warn('Maximum retry attempts reached')
                return
            }

            initializationManager.reset()
            initializationManager
                .initialize(options)
                .then(setResult)
                .catch((error) => {
                    console.error('Retry failed:', error)
                    setResult({
                        envConfig: null as any,
                        queryClient: null as any,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    })
                })
        },
        forceRetry: () => {
            initializationManager.forceReset()
            initializationManager
                .initialize(options)
                .then(setResult)
                .catch((error) => {
                    console.error('Force retry failed:', error)
                    setResult({
                        envConfig: null as any,
                        queryClient: null as any,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    })
                })
        },
    }
}
