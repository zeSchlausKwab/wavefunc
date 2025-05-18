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
    const { initialRelaysOverride, searchRelaysOverride } = options

    // Determine relays to use
    const initialRelaysToUse = initialRelaysOverride || DEFAULT_RELAYS
    const searchRelaysToUse = searchRelaysOverride || ['wss://relay.wavefunc.live']

    console.log(`[initializeAppCore] Initializing Main NDK with relays: ${initialRelaysToUse.join(', ')}`)
    console.log(`[initializeAppCore] Initializing Search NDK with relays: ${searchRelaysToUse.join(', ')}`)

    // NDK Initialization
    const ndk = ndkActions.initialize(initialRelaysToUse)
    ndkActions.initializeSearchNdk(searchRelaysToUse)

    // Connections
    try {
        const ndkState = ndkActions.getState()
        if (!ndkState.isConnected && !ndkState.isConnecting) {
            console.log('[initializeAppCore] Connecting to main NDK...')
            await ndkActions.connect()
            console.log('[initializeAppCore] Main NDK connected or connection attempt made.')
        }

        const searchNdkState = ndkState.searchNdk
        if (searchNdkState && !searchNdkState.isConnected && !searchNdkState.isConnecting) {
            console.log('[initializeAppCore] Connecting to search NDK...')
            await ndkActions.connectSearchNdk()
            console.log('[initializeAppCore] Search NDK connected or connection attempt made.')
        }
    } catch (err) {
        console.error('[initializeAppCore] Error connecting to NDK relays:', err)
    }

    // Wallet Reconnection
    try {
        console.log('[initializeAppCore] Attempting to reconnect wallet from storage...')
        await walletActions.reconnectFromStorage(ndk)
        console.log('[initializeAppCore] Wallet reconnection attempt finished.')
    } catch (err) {
        console.error('[initializeAppCore] Failed to reconnect wallet:', err)
    }

    // Auth Initialization
    console.log('[initializeAppCore] Initializing auth state from local storage...')
    authActions.getAuthFromLocalStorageAndLogin()
    console.log('[initializeAppCore] Auth initialization finished.')

    console.log('[initializeAppCore] Core application services initialization process completed.')
}
