# WaveFunc Radio

A Nostr-based internet radio directory and player with full-text search capabilities.

## Features

- 🎵 **Radio Station Directory**: Browse and discover internet radio stations on Nostr
- 🔍 **Full-Text Search**: Search stations by name and description (NIP-50)
- 💾 **SQLite Storage**: Persistent event storage (just files!)
- ⚡ **Fast Search**: Powered by Bluge full-text search engine
- 🌐 **Nostr Protocol**: Built on the decentralized Nostr protocol
- ⚛️ **Modern Frontend**: React + TypeScript + Tailwind CSS
- 🚀 **No Dependencies**: No Docker or external databases needed

## Project Structure

```
wavefunc-rewrite/
├── relay/              # Khatru-based Nostr relay with search
│   ├── main.go        # Relay implementation
│   ├── setup.sh       # Automated setup script
│   └── README.md      # Relay documentation
├── src/               # Frontend application
│   ├── components/    # React components
│   └── lib/          # Utilities and hooks
└── scripts/          # Seed and generation scripts
```

## Quick Start

### 1. Set up the Relay

The relay provides the backend Nostr relay with SQLite storage and full-text search:

```bash
cd relay
./setup.sh
make dev
```

This will:

- Install Go dependencies
- Create data directories
- Start the relay on port 3334

For more details, see [relay/README.md](relay/README.md)

### 2. Install Frontend Dependencies

```bash
bun install
```

### 3. Start Development

```bash
# In one terminal: Start the relay
bun run relay

# In another terminal: Start the frontend
bun --hot src/index.tsx
```

Or use the combined dev command:

```bash
bun dev
```

## Available Scripts

### Frontend

- `bun dev` - Start relay, migrate 500 real stations, and run development server
- `bun dev:fake` - Start relay with fake/test data instead of real stations
- `bun seed` - Seed the relay with fake test data
- `bun start` - Run in production mode
- `bun build` - Build for production

### Relay

- `bun run relay` - Start the relay
- `bun run relay:reset` - Reset database and search index
- `cd relay && make dev` - Run relay in development mode
- `cd relay && make reset-all` - Reset all data

### Tauri (Desktop & Mobile)

- `bun run tauri:dev` - Start Tauri desktop development
- `bun run tauri:build` - Build Tauri desktop application
- `bun run tauri:android` - Initialize and run Android emulator
- `bun run tauri:android:build` - Build Android APK

### Migration

- `bun run migrate` - Migrate 500 random stations from legacy database (default)
- `bun run migrate 50` - Migrate 50 random stations
- `bun run migrate 1000` - Migrate 1000 random stations

**Note:** Duplicate stations (same name + country) are automatically merged into single events with multiple streams.

See [legacy-db/README.md](legacy-db/README.md) for details on the legacy database structure and migration process.

## Technology Stack

### Backend (Relay)

- **[Khatru](https://khatru.nostr.technology/)** - Nostr relay framework
- **[Bluge](https://github.com/blugelabs/bluge)** - Full-text search engine
- **SQLite** - Primary event storage (via eventstore/sqlite3)
- **Go 1.23+** - Programming language

### Frontend

- **[Bun](https://bun.com)** - Fast JavaScript runtime & bundler
- **React 19** - UI framework
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **NDK** - Nostr Development Kit
- **shadcn/ui** - UI component library

## Configuration

### Relay Configuration

The relay can be configured via command-line flags:

```bash
cd relay
go run . \
  --port 3334 \
  --db-path ./data/events.db \
  --search-path ./data/search
```

All data is stored in local files - no external configuration needed!

## Development

### Reset Everything

To start fresh:

```bash
bun run relay:reset
bun run seed
```

### View Data

```bash
cd relay

# View SQLite database
sqlite3 data/events.db

# Check data directory
ls -la data/
```

### Android Development

The app automatically detects when running on Android and uses the correct relay URL:

- **Desktop/Web**: `ws://localhost:3334`
- **Android Emulator**: `ws://10.0.2.2:3334` (Android's special IP to reach host machine)

To develop for Android:

1. Ensure the relay is running on your host machine:
   ```bash
   bun run relay
   ```

2. Start the Android emulator:
   ```bash
   bun run tauri:android
   ```

The app will automatically connect to the relay using the platform-appropriate URL. No additional configuration needed!

## Event Kinds Supported

See [SPEC.md](SPEC.md) for detailed specification.

- **31237** - Radio Station Events
- **30078** - Favorites Lists & Featured Station Lists
- **31990** - NIP-89 Handler Events
- **31989** - NIP-89 Recommendation Events
- **1311** - Live Chat Messages
- **1111** - Station Comments

## NIP Support

The relay implements the following NIPs:

- NIP-01: Basic protocol flow
- NIP-09: Event deletion
- NIP-11: Relay information document
- NIP-12: Generic tag queries
- NIP-15: End of stored events notice
- NIP-16: Event treatment
- NIP-20: Command results
- NIP-22: Comment events
- NIP-33: Parameterized replaceable events
- NIP-40: Expiration timestamp
- NIP-50: Search capability

## License

See LICENSE file for details.

## Contributing

Contributions are welcome! Please read the [SPEC.md](SPEC.md) for the event structure specification.
