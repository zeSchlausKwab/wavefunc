import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { config } from '@wavefunc/common'
import path from 'path'
import WebSocket from 'ws'
;(global as any).WebSocket = WebSocket

// TODO: Backend ndks can be extracted into a shared package

class DVMService {
    private static instance: DVMService
    private ndk: NDK

    private constructor() {
        // config({ path: path.resolve(__dirname, '../../../../.env') })

        const PRIVATE_KEY = config.dvm.privateKey
        const LOCAL_MACHINE_IP = config.server.host

        const WS_PROTOCOL = config.app.env === 'development' ? 'ws' : 'wss'
        const REALY_PREFIX = config.app.env === 'development' ? '' : 'relay.'
        const PORT_OR_DEFAULT = config.app.env === 'development' ? ':3002' : ''

        if (!PRIVATE_KEY) {
            throw new Error('DVM_PRIVATE_KEY environment variable is required')
        }

        const signer = new NDKPrivateKeySigner(PRIVATE_KEY)
        this.ndk = new NDK({
            explicitRelayUrls: [
                `${WS_PROTOCOL}://${REALY_PREFIX}${LOCAL_MACHINE_IP}${PORT_OR_DEFAULT}`,
                // ...defaultRelays,
            ],
            signer,
        })
    }

    public static getInstance(): DVMService {
        if (!DVMService.instance) {
            DVMService.instance = new DVMService()
        }
        return DVMService.instance
    }

    public async connect(): Promise<void> {
        try {
            await this.ndk.connect()
        } catch (error) {
            console.error('Connection error:', error)
            throw error
        }
    }

    public getNDK(): NDK {
        return this.ndk
    }
}

export const dvmService = DVMService.getInstance()
