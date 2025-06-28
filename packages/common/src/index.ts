// === Core Types and Schemas ===
export * from './types'
export * from './types/station'
export * from './types/stream'
export * from './types/comment'
export * from './schemas/user'
export * from './schemas/dvm'
export * from './schemas/station'
export { RADIO_EVENT_KINDS } from './schemas/events'

// === Configuration ===
export * from './config'
export * from './constants/relays'

// === Core Utilities ===
export * from './utils'
export * from './lib/utils'
export * from './lib/utils/streamUtils'

// === TanStack Query Integration ===
export * from './queries'
export * from './queries/query-keys'
export * from './queries/query-client'
export * from './queries/stations'
export * from './queries/profiles'
export * from './queries/mutations'
export * from './queries/favorites'
export * from './queries/comments'
export * from './queries/dvmcp'
export * from './queries/real-time'

// === Legacy Nostr Services (to be gradually replaced by queries) ===
export * from './nostr'
export * from './nostr/service'
export * from './nostr/radio'
export * from './nostr/publish'
export * from './nostr/favorites'
export * from './nostr/comments'
export * from './nostr/reactions'
export * from './nostr/featured'

// === Application Initialization ===
export * from './lib/init/initialization-manager'
export * from './lib/init/use-initialization'

// === State Management (TanStack Store) ===
export * from './lib/store/wallet'
export * from './lib/store/stations'
export * from './lib/store/ui'
export * from './lib/store/env'
export * from './lib/store/ndk'
export * from './lib/store/auth'
export * from './lib/store/history'

// === Router Utilities ===
export { type AppRouterContext, getQueryClient } from './lib/router-utils'

// Hooks directory is empty
export * from './components/auth/AuthButton'
export * from './components/auth/NostrConnectQR'
export * from './components/settings/RelaysSettings'
export * from './components/settings/CashuWalletSettings'
export * from './components/settings/NWCWalletSettings'
export * from './components/settings/ProfileSettings'
export * from './components/Header'
export * from './components/Nav'
export * from './components/Profile'
export * from './components/RadioPlayer'
export * from './components/EditStationDrawer'
export * from './components/auth/LoginDialog'
export * from './components/auth/BunkerConnect'
export * from './components/auth/NostrConnectQR'
export * from './components/RadioPlayer'
export * from './components/radio/RadioCard'
export * from './components/radio/APIStationCard'
export * from './components/AnimatedLogo'
export * from './components/radio/StreamSelector'
export * from './components/comments/CommentsList'
export * from './components/comments/CommentItem'
export * from './components/comments/CreateComment'
export * from './components/comments/ReplyToComment'
export * from './components/favorites/FavoritesManager'
export * from './components/Nip05Badge'
export * from './components/station/StationGrid'
export * from './components/CheckerPattern'
export * from './components/radio/HistoryDrawer'
export * from './components/radio/IcecastMetadataDisplay'
export * from './components/comments/Shoutbox'
export * from './components/AboutContainer'
export * from './components/LibraryContainer'
export * from './components/DiscogsMetadata'
export * from './components/MusicRecognitionButton'

// export * from './components/radio/RadioStationsList'
// export * from './components/radio/GenreSelector'

export * from './components/zap/ZapDialog'

// Services
export * from './services/music-metadata'
export { createDVMCPService, getDVMCPService, setupNWCPayments } from './services/dvmcp'

// Re-export NDKEvent as a value from the NDK package that common uses
export { NDKEvent } from '@nostr-dev-kit/ndk'
