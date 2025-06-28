import { config } from '../config'

// Default Nostr Connect relays (used for NIP-46 remote signing)
export function getDefaultNostrConnectRelays(): string[] {
    return [config.nostr.connectRelayUrl]
}

// Default relay list for general Nostr communication
export function getDefaultRelays(): string[] {
    return config.nostr.defaultRelayUrls.length > 0
        ? config.nostr.defaultRelayUrls
        : [
              'wss://relay.wavefunc.live',
              'wss://relay.nostr.band',
              'wss://nos.lol',
              'wss://relay.nostr.net',
              'wss://relay.damus.io',
          ]
}

// Local development relay - composed from environment configuration
export function getLocalDvmcpRelay(): string {
    return config.urls.localRelay
}

// Backwards compatibility exports (will be deprecated)
export const defaultNostrConnectRelays = getDefaultNostrConnectRelays()
export const DEFAULT_RELAYS = getDefaultRelays()
export const LOCAL_DVMCP_RELAY = getLocalDvmcpRelay()
