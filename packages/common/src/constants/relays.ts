import { config } from '../config'

// Default Nostr Connect relays (used for NIP-46 remote signing)
export const defaultNostrConnectRelays = [config.nostr.connectRelayUrl]

// Default relay list for general Nostr communication
export const DEFAULT_RELAYS =
    config.nostr.defaultRelayUrls.length > 0
        ? config.nostr.defaultRelayUrls
        : [
              'wss://relay.wavefunc.live',
              'wss://relay.nostr.band',
              'wss://nos.lol',
              'wss://relay.nostr.net',
              'wss://relay.damus.io',
          ]

// Local development relay - composed from environment configuration
export const LOCAL_DVMCP_RELAY = config.urls.localRelay
