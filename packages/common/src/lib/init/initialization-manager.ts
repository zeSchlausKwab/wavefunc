import type { EnvConfig } from '../../config/env'
import type { QueryClient } from '@tanstack/react-query'
import { DEFAULT_RELAYS, LOCAL_DVMCP_RELAY, ndkActions, walletActions, authActions, envActions } from '@wavefunc/common'
import { initializeQueryClient } from '../../queries/query-client'

export interface InitializationOptions {
    initialEnvConfig?: EnvConfig
    /** List of initial NDK relays. Defaults to environment-based relay. */
    initialRelaysOverride?: string[]
    /** List of search NDK relays. Defaults to environment-based relay. */
    searchRelaysOverride?: string[]
}

export interface InitializationResult {
    envConfig: EnvConfig
    queryClient: QueryClient
    error?: string
}

export type InitializationPhase = 'idle' | 'environment' | 'ndk' | 'services' | 'complete' | 'error'

export interface InitializationState {
    phase: InitializationPhase
    isInitialized: boolean
    error?: string
    progress: number
    retryCount: number
    canRetry: boolean
}

type InitializationCallback = (state: InitializationState) => void

class AppInitializationManager {
    private static readonly MAX_RETRIES = 3
    private static readonly RETRY_DELAYS = [1000, 2000, 5000] // Progressive delays in ms

    private state: InitializationState = {
        phase: 'idle',
        isInitialized: false,
        progress: 0,
        retryCount: 0,
        canRetry: true,
    }

    private callbacks: Set<InitializationCallback> = new Set()
    private initPromise: Promise<InitializationResult> | null = null
    private envConfig: EnvConfig | null = null
    private queryClient: QueryClient | null = null

    subscribe(callback: InitializationCallback): () => void {
        this.callbacks.add(callback)
        // Immediately call with current state
        callback(this.state)

        return () => {
            this.callbacks.delete(callback)
        }
    }

    private updateState(updates: Partial<InitializationState>) {
        this.state = { ...this.state, ...updates }
        this.callbacks.forEach((callback) => callback(this.state))
    }

    private createRelayUrl(envConfig: EnvConfig): string {
        const isBrowser = typeof window !== 'undefined'
        const localMachineIp = envConfig.VITE_PUBLIC_HOST || (isBrowser ? window.location.hostname : 'localhost')
        const wsProtocol = envConfig.VITE_PUBLIC_APP_ENV === 'development' ? 'ws' : 'wss'
        const relayPrefix = envConfig.VITE_PUBLIC_APP_ENV === 'development' ? '' : 'relay.'
        const portSuffix = envConfig.VITE_PUBLIC_APP_ENV === 'development' ? ':3002' : ''

        return `${wsProtocol}://${relayPrefix}${localMachineIp}${portSuffix}`
    }

    private async initializeEnvironment(options: InitializationOptions): Promise<EnvConfig> {
        this.updateState({ phase: 'environment', progress: 10 })
        console.log('[InitManager] Phase 1: Initializing Environment Configuration...')

        let resolvedEnvConfig: EnvConfig

        if (options.initialEnvConfig) {
            console.log('[InitManager] Using initialEnvConfig from options')
            resolvedEnvConfig = options.initialEnvConfig
        } else {
            console.log('[InitManager] Attempting to load envConfig on client')

            // Try to get preloaded env from hydration script
            let preloadedEnv: EnvConfig | null = null
            if (typeof window !== 'undefined') {
                const preloadedEnvScript = document.getElementById('env-config-hydration')
                if (preloadedEnvScript?.textContent) {
                    try {
                        preloadedEnv = JSON.parse(preloadedEnvScript.textContent)
                        console.log('[InitManager] Using envConfig from hydration script')
                    } catch (e) {
                        console.error('[InitManager] Failed to parse preloaded env config from script', e)
                    }
                }
            }

            if (preloadedEnv) {
                resolvedEnvConfig = preloadedEnv
            } else {
                console.log('[InitManager] Fetching envConfig via API')
                resolvedEnvConfig = await envActions.initialize()
            }
        }

        if (!resolvedEnvConfig) {
            throw new Error('Environment configuration could not be resolved.')
        }

        // Set in global env store - ensure required fields are properly typed
        const storeConfig = {
            ...resolvedEnvConfig,
            VITE_PUBLIC_HOST: resolvedEnvConfig.VITE_PUBLIC_HOST || 'localhost',
            VITE_PUBLIC_APP_ENV: resolvedEnvConfig.VITE_PUBLIC_APP_ENV || 'development',
            VITE_APP_PUBKEY: resolvedEnvConfig.VITE_APP_PUBKEY || '',
        }
        envActions.setEnv(storeConfig as any)
        this.envConfig = resolvedEnvConfig

        console.log('[InitManager] Environment Configuration Initialized:', resolvedEnvConfig)
        return resolvedEnvConfig
    }

    private async initializeNDK(envConfig: EnvConfig, options: InitializationOptions): Promise<void> {
        this.updateState({ phase: 'ndk', progress: 30 })
        console.log('[InitManager] Phase 2: Initializing NDK...')

        const localRelay = this.createRelayUrl(envConfig)

        // Determine which relays to use - include DVMCP relay for development
        let initialRelays = options.initialRelaysOverride || [localRelay]
        let searchRelays = options.searchRelaysOverride || [localRelay]

        // Add local DVMCP relay in development for better DVMCP communication
        if (envConfig.VITE_PUBLIC_APP_ENV === 'development') {
            if (!initialRelays.includes(LOCAL_DVMCP_RELAY)) {
                initialRelays = [...initialRelays, LOCAL_DVMCP_RELAY]
            }
            if (!searchRelays.includes(LOCAL_DVMCP_RELAY)) {
                searchRelays = [...searchRelays, LOCAL_DVMCP_RELAY]
            }
        }

        console.log('[InitManager] Initializing Main NDK with relays:', initialRelays)
        console.log('[InitManager] Initializing Search NDK with relays:', searchRelays)

        // Initialize NDK instances
        const ndk = ndkActions.initialize(initialRelays)
        ndkActions.initializeSearchNdk(searchRelays)

        // Connect to NDK relays
        try {
            const ndkState = ndkActions.getState()

            // Connect main NDK if not already connected
            if (!ndkState.isConnected && !ndkState.isConnecting) {
                console.log('[InitManager] Connecting to main NDK...')
                await ndkActions.connect()
                console.log('[InitManager] Main NDK connection initiated')
            } else {
                console.log('[InitManager] Main NDK already connected/connecting')
            }

            // Connect search NDK if available and not connected
            const searchNdkState = ndkState.searchNdk
            if (searchNdkState?.ndk && !searchNdkState.isConnected && !searchNdkState.isConnecting) {
                console.log('[InitManager] Connecting to search NDK...')
                await ndkActions.connectSearchNdk()
                console.log('[InitManager] Search NDK connection initiated')
            }

            // Add local relay to NDK if not present (for development)
            if (typeof window !== 'undefined' && envConfig.VITE_PUBLIC_APP_ENV === 'development') {
                setTimeout(() => {
                    const relays = ndkActions.getRelays()
                    const localRelayConnected = relays.some((r) => r.url === localRelay)
                    if (!localRelayConnected) {
                        console.log('[InitManager] Adding local relay to connection pool')
                        ndkActions.addRelay(localRelay)
                    }
                }, 2000)
            }
        } catch (err) {
            console.error('[InitManager] Error connecting to NDK relays:', err)
            // Don't throw - allow app to continue with limited functionality
        }
    }

    private async initializeServices(envConfig: EnvConfig): Promise<void> {
        this.updateState({ phase: 'services', progress: 60 })
        console.log('[InitManager] Phase 3: Initializing Services...')

        // Initialize TanStack Query Client
        try {
            console.log('[InitManager] Initializing TanStack Query Client...')
            this.queryClient = initializeQueryClient()
            console.log('[InitManager] TanStack Query Client initialized')
        } catch (err) {
            console.error('[InitManager] TanStack Query Client initialization failed:', err)
            throw new Error('Failed to initialize query client')
        }

        const ndk = ndkActions.getNDK()
        if (!ndk) {
            console.warn('[InitManager] NDK not available for service initialization')
            return
        }

        // Initialize wallet reconnection
        try {
            console.log('[InitManager] Attempting wallet reconnection...')
            await walletActions.reconnectFromStorage(ndk)
            console.log('[InitManager] Wallet reconnection completed')
        } catch (err) {
            console.error('[InitManager] Wallet reconnection failed:', err)
        }

        // Initialize authentication
        try {
            console.log('[InitManager] Initializing authentication...')
            await authActions.getAuthFromLocalStorageAndLogin()
            console.log('[InitManager] Authentication initialization completed')
        } catch (err) {
            console.error('[InitManager] Authentication initialization failed:', err)
        }

        // Initialize DVMCP service
        try {
            console.log('[InitManager] Creating DVMCP service...')
            const { createDVMCPService } = await import('../../services/dvmcp')
            createDVMCPService(ndk)
            console.log('[InitManager] DVMCP service created')
        } catch (err) {
            console.error('[InitManager] Failed to create DVMCP service:', err)
        }

        this.updateState({ progress: 80 })
    }

    private async initializeQueryClient(): Promise<QueryClient> {
        console.log('[InitManager] Phase 4: Initializing Query Client...')
        const { createQueryClient } = await import('../queryClient')
        const queryClient = await createQueryClient()
        this.queryClient = queryClient
        console.log('[InitManager] Query Client initialized')
        return queryClient
    }

    async initialize(options: InitializationOptions = {}): Promise<InitializationResult> {
        // Return existing promise if already initializing
        if (this.initPromise) {
            return this.initPromise
        }

        // Return cached result if already initialized
        if (this.state.isInitialized && this.envConfig && this.queryClient) {
            return {
                envConfig: this.envConfig,
                queryClient: this.queryClient,
            }
        }

        this.initPromise = this.performInitialization(options)
        return this.initPromise
    }

    private async performInitialization(options: InitializationOptions): Promise<InitializationResult> {
        try {
            this.updateState({ phase: 'environment', progress: 0, error: undefined })

            // Phase 1: Environment
            const envConfig = await this.withRetry(() => this.initializeEnvironment(options), 'environment')

            // Phase 2: NDK
            await this.withRetry(() => this.initializeNDK(envConfig, options), 'ndk')

            // Phase 3: Services (includes Query Client initialization)
            await this.withRetry(() => this.initializeServices(envConfig), 'services')

            // Ensure query client was initialized
            if (!this.queryClient) {
                throw new Error('Query client not initialized properly')
            }

            // Complete
            this.updateState({
                phase: 'complete',
                isInitialized: true,
                progress: 100,
                retryCount: 0, // Reset retry count on success
            })

            console.log('[InitManager] Application initialization completed successfully')

            return {
                envConfig,
                queryClient: this.queryClient,
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error'
            console.error('[InitManager] Initialization failed after retries:', error)

            this.updateState({
                phase: 'error',
                error: errorMessage,
                progress: 0,
                canRetry: this.state.retryCount < AppInitializationManager.MAX_RETRIES,
            })

            return {
                envConfig: this.envConfig!,
                queryClient: this.queryClient!,
                error: errorMessage,
            }
        }
    }

    private async withRetry<T>(operation: () => Promise<T>, operationName: string, maxRetries: number = 2): Promise<T> {
        let lastError: Error | null = null

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation()
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(`${operationName} failed`)
                console.warn(`[InitManager] ${operationName} attempt ${attempt + 1} failed:`, lastError.message)

                // Don't retry on the last attempt
                if (attempt < maxRetries) {
                    const delay =
                        AppInitializationManager.RETRY_DELAYS[
                            Math.min(attempt, AppInitializationManager.RETRY_DELAYS.length - 1)
                        ]
                    console.log(`[InitManager] Retrying ${operationName} in ${delay}ms...`)
                    await new Promise((resolve) => setTimeout(resolve, delay))
                }
            }
        }

        throw lastError || new Error(`${operationName} failed after ${maxRetries + 1} attempts`)
    }

    reset(): void {
        this.state = {
            phase: 'idle',
            isInitialized: false,
            progress: 0,
            retryCount: this.state.retryCount + 1,
            canRetry: this.state.retryCount + 1 < AppInitializationManager.MAX_RETRIES,
        }
        this.initPromise = null
        // Don't reset envConfig and queryClient in case they're partially initialized
        this.callbacks.forEach((callback) => callback(this.state))
    }

    forceReset(): void {
        this.state = {
            phase: 'idle',
            isInitialized: false,
            progress: 0,
            retryCount: 0,
            canRetry: true,
        }
        this.initPromise = null
        this.envConfig = null
        this.queryClient = null
        this.callbacks.forEach((callback) => callback(this.state))
    }

    getState(): InitializationState {
        return { ...this.state }
    }

    isReady(): boolean {
        return this.state.isInitialized && this.state.phase === 'complete'
    }
}

// Singleton instance
export const initializationManager = new AppInitializationManager()
