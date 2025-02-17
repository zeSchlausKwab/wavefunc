import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie'

// TODO: Move to env variables
const PRIVATE_KEY = '5c81bffa8303bbd7726d6a5a1170f3ee46de2addabefd6a735845166af01f5c0' // Replace with your test private key

const defaultRelays = process.env.NEXT_PUBLIC_DEFAULT_RELAYS
  ? JSON.parse(process.env.NEXT_PUBLIC_DEFAULT_RELAYS)
  : ['ws://localhost:3002']

const LOCAL_MACHINE_IP = process.env.NEXT_PUBLIC_LOCAL_MACHINE_IP
if (!LOCAL_MACHINE_IP) {
  throw new Error('NEXT_PUBLIC_LOCAL_MACHINE_IP environment variable is required')
}

const dexieAdapter = new NDKCacheAdapterDexie({ dbName: 'gmsirs-ndk-cache' })

class NostrService {
  private static instance: NostrService
  private ndk: NDK

  private constructor() {
    const signer = new NDKPrivateKeySigner(PRIVATE_KEY)
    this.ndk = new NDK({
      explicitRelayUrls: [
        `ws://${LOCAL_MACHINE_IP}:3002`,
        // 'ws://localhost:3002',
        ...defaultRelays,
        // 'wss://relay.damus.io',
        // 'wss://relay.nostr.band',
      ],
      signer,
      cacheAdapter: dexieAdapter,
    })
  }

  public static getInstance(): NostrService {
    if (!NostrService.instance) {
      NostrService.instance = new NostrService()
    }
    return NostrService.instance
  }

  public async connect(): Promise<void> {
    await this.ndk.connect()
  }

  public getNDK(): NDK {
    return this.ndk
  }
}

export const nostrService = NostrService.getInstance()
