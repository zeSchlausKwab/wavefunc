import { Store } from '@tanstack/store'
import type NDK from '@nostr-dev-kit/ndk'
import { NDKWallet, NDKNWCWallet, NDKCashuWallet } from '@nostr-dev-kit/ndk-wallet'

// We use a union type for wallet types
type WalletType = 'nwc' | 'cashu'

export interface NWCWalletData {
    type: 'nwc'
    pairingCode: string
}

export interface CashuWalletData {
    type: 'cashu'
    mints: string[]
    relays: string[]
}

interface WalletState {
    wallet: NDKWallet | null
    walletData: NWCWalletData | CashuWalletData | null
    isConnected: boolean
    balance?: number
}

const initialState: WalletState = {
    wallet: null,
    walletData: null,
    isConnected: false,
    balance: undefined,
}

// Try to load wallet data from localStorage
try {
    const isBrowser = typeof window !== 'undefined'
    const savedWallet = isBrowser ? localStorage.getItem('wallet_data') : null
    if (savedWallet) {
        const data = JSON.parse(savedWallet)
        if (data && data.type) {
            initialState.walletData = data
        }
    }
} catch (err) {
    console.error('Failed to load wallet data from localStorage', err)
}

export const walletStore = new Store<WalletState>(initialState)

export const walletActions = {
    connectNWC: async (ndk: NDK, pairingCode: string) => {
        if (!ndk) return null

        try {
            // Create the wallet instance
            const wallet = new NDKNWCWallet(ndk, { pairingCode })

            // Save the wallet data in localStorage
            const walletData: NWCWalletData = {
                type: 'nwc',
                pairingCode,
            }
            localStorage.setItem('wallet_data', JSON.stringify(walletData))

            // Update the store
            walletStore.setState((state) => ({
                ...state,
                wallet,
                walletData,
                isConnected: true,
            }))

            // Try to fetch balance
            wallet.on('ready', async () => {
                await walletActions.updateBalance()
            })

            return wallet
        } catch (err) {
            console.error('Failed to connect NWC wallet', err)
            throw err
        }
    },

    connectCashu: async (ndk: NDK, mints: string[], relays: string[] = []) => {
        if (!ndk) return null

        try {
            // Create the wallet instance
            const wallet = new NDKCashuWallet(ndk)

            // Mints are stored in mintUrls array - we can't directly add them with a method
            // Directly access the property (this is based on seeing mintUrls in examples)
            if (Array.isArray((wallet as any).mintUrls)) {
                ;(wallet as any).mintUrls = [...mints]
            }

            // Save wallet data in localStorage
            const walletData: CashuWalletData = {
                type: 'cashu',
                mints,
                relays,
            }
            localStorage.setItem('wallet_data', JSON.stringify(walletData))

            // Update the store
            walletStore.setState((state) => ({
                ...state,
                wallet,
                walletData,
                isConnected: true,
            }))

            // Try to fetch balance
            await walletActions.updateBalance()

            return wallet
        } catch (err) {
            console.error('Failed to connect Cashu wallet', err)
            throw err
        }
    },

    reconnectFromStorage: async (ndk: NDK) => {
        if (!ndk) return null

        const { walletData } = walletStore.state
        if (!walletData) return null

        try {
            if (walletData.type === 'nwc') {
                return await walletActions.connectNWC(ndk, walletData.pairingCode)
            } else if (walletData.type === 'cashu') {
                return await walletActions.connectCashu(ndk, walletData.mints, walletData.relays)
            }
        } catch (err) {
            console.error('Failed to reconnect wallet from storage', err)
            walletActions.disconnect()
            return null
        }
    },

    disconnect: () => {
        // Remove wallet data from localStorage
        localStorage.removeItem('wallet_data')

        // Update the store
        walletStore.setState((state) => ({
            ...state,
            wallet: null,
            walletData: null,
            isConnected: false,
            balance: undefined,
        }))
    },

    updateBalance: async () => {
        const { wallet } = walletStore.state
        if (!wallet) return

        try {
            // Trigger wallet to update its balance
            if (wallet.updateBalance) {
                await wallet.updateBalance()
            }

            // Get the balance from the wallet
            const walletBalance = wallet.balance

            if (walletBalance) {
                const balance = typeof walletBalance === 'number' ? walletBalance : walletBalance.amount

                walletStore.setState((state) => ({
                    ...state,
                    balance,
                }))
            }
        } catch (err) {
            console.error('Failed to update balance', err)
        }
    },
}
