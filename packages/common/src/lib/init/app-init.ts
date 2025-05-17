import type { EnvConfig } from '../../config/env'
import { DEFAULT_RELAYS, ndkActions, walletActions, authActions } from '@wavefunc/common'

export interface InitializeAppCoreOptions {
    env: EnvConfig
    /** List of initial NDK relays. Defaults to DEFAULT_RELAYS. */
    initialRelaysOverride?: string[]
    /** List of search NDK relays. Defaults to ['wss://relay.wavefunc.live']. */
    searchRelaysOverride?: string[]
}

/**
 * Initializes core application services like NDK, wallet, and auth.
 * This function is intended to be called after environment variables are set.
 */
export async function initializeAppCore(options: InitializeAppCoreOptions): Promise<void> {
    const { env, initialRelaysOverride, searchRelaysOverride } = options

    // Determine relays to use
    const initialRelaysToUse =
        initialRelaysOverride ||
        env.VITE_DEVICES_INITIAL_RELAYS?.split(',')
            .map((r) => r.trim())
            .filter((r) => r) ||
        DEFAULT_RELAYS
    const searchRelaysToUse = searchRelaysOverride ||
        env.VITE_DEVICES_SEARCH_RELAYS?.split(',')
            .map((r) => r.trim())
            .filter((r) => r) || ['wss://relay.wavefunc.live']

    console.log(`Initializing Main NDK with relays: ${initialRelaysToUse.join(', ')}`)
    console.log(`Initializing Search NDK with relays: ${searchRelaysToUse.join(', ')}`)

    // NDK Initialization
    const ndk = ndkActions.initialize(initialRelaysToUse)
    ndkActions.initializeSearchNdk(searchRelaysToUse)

    // Connections
    try {
        const ndkState = ndkActions.getState()
        if (!ndkState.isConnected && !ndkState.isConnecting) {
            console.log('Connecting to main NDK...')
            await ndkActions.connect()
            console.log('Main NDK connected or connection attempt made.')
        }

        const searchNdkState = ndkState.searchNdk
        if (searchNdkState && !searchNdkState.isConnected && !searchNdkState.isConnecting) {
            console.log('Connecting to search NDK...')
            await ndkActions.connectSearchNdk()
            console.log('Search NDK connected or connection attempt made.')
        }
    } catch (err) {
        console.error('Error connecting to NDK relays during core initialization:', err)
        // Depending on severity, you might want to re-throw or set a global error state
    }

    // Wallet Reconnection
    try {
        console.log('Attempting to reconnect wallet from storage...')
        await walletActions.reconnectFromStorage(ndk)
        console.log('Wallet reconnection attempt finished.')
    } catch (err) {
        console.error('Failed to reconnect wallet during core initialization:', err)
    }

    // Auth Initialization
    console.log('Initializing auth state from local storage...')
    authActions.getAuthFromLocalStorageAndLogin()
    console.log('Auth initialization finished.')

    console.log('Core application services (NDK, Wallet, Auth) initialization process completed.')
}
