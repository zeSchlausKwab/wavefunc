import { RouterProvider } from '@tanstack/react-router'
import { authActions, DEFAULT_RELAYS, ndkActions, walletActions } from '@wavefunc/common'
import { useEffect } from 'react'
import { router } from './routeConfig'

// Import required styles
import '@wavefunc/ui/index.css'
import './index.css'

const loadEnvAndNdk = async () => {
    const ndk = ndkActions.initialize([...DEFAULT_RELAYS, 'ws://192.168.100.99:3002'])
    await ndkActions.connect()

    // Try to reconnect wallet if it exists
    await walletActions.reconnectFromStorage(ndk).catch((err) => {
        console.error('Failed to reconnect wallet', err)
    })

    authActions.getAuthFromLocalStorageAndLogin()
}

function App() {
    // Initialize NDK
    useEffect(() => {
        loadEnvAndNdk()

        return () => {
            // NDK cleanup on unmount
            console.log('NDK cleanup')
        }
    }, [])

    // The entire app is rendered inside RouterProvider
    return (
        <div className="app">
            <RouterProvider router={router} />
        </div>
    )
}

export default App
