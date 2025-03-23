# WaveFunc

A decentralized internet radio registry built on Nostr, offering music recognition capabilities and favorites management.

<div align="center">
  <img src="apps/web/public/images/logo.png" alt="WaveFunc Logo" width="200" />
</div>

## Features

- 🎵 **Radio Station Streaming**: Listen to radio stations from around the world
- 🔍 **Music Recognition**: Identify songs playing on any radio station
- ⭐ **Favorites**: Create and manage lists of your favorite stations
- 🔑 **Nostr Authentication**: Seamless login with your Nostr key
- 🌐 **Decentralized**: Built on Nostr protocol for censorship resistance
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: React, TailwindCSS, Vite, Tanstack Router
- **Backend**: Bun, Elysia
- **Nostr**: NDK (Nostr Development Kit)
- **Deployment**: Docker, Nginx, Railway
- **Music Recognition**: AudD API via DVM (Nostr Data Verification Method)

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.x or higher
- [Node.js](https://nodejs.org/) v18.x or higher
- [Git](https://git-scm.com/)

### Getting Started

1. Clone the repository:

```bash
git clone https://github.com/zeSchlausKwab/wavefunc.git
cd wavefunc
```

2. Install dependencies:

```bash
bun install
```

3. Set up environment variables:

```bash
cp .env.sample .env
```

Edit the `.env` file and fill in the required values (see Environment Variables section).

4. Start the development server:

```bash
bun run dev
```

This will start all services:

- Web app: http://localhost:8080
- Backend API: http://localhost:3001
- Relay: ws://localhost:3002

### Environment Variables

The following environment variables are required:

```
VITE_PUBLIC_APP_ENV=development
PUBLIC_HOST=localhost
PUBLIC_RELAY_PORT=3002
PUBLIC_WEB_PORT=8080
PUBLIC_API_PORT=3001
PUBLIC_BLOSSOM_URL=<url>
```

> **Important:** When testing features like NIP-46 login or using the app from other devices on your network, set `PUBLIC_HOST` to your machine's local IP address (e.g., `192.168.1.x`) instead of `localhost`. This ensures proper communication between devices on your network.

For production, you'll also need:

```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<your-password>
POSTGRES_DB=nostr
POSTGRES_PORT=5432
POSTGRES_HOST=localhost
```

## Project Structure

```
/apps
  /web          # React frontend
  /backend      # Elysia API server
/infra
  /relay        # Nostr relay
  /dvm          # Data Verification Method service
/packages       # Shared code
```

## Development

### Available Commands

- `bun run dev`: Start all services in development mode
- `bun run dev:web`: Start only the web frontend
- `bun run dev:backend`: Start only the backend API
- `bun run dev:relay`: Start only the Nostr relay
- `bun run dev:dvm`: Start only the DVM service
- `bun run build`: Build the application for production
- `bun run test`: Run tests
- `bun run format`: Format code using Prettier

## License

[MIT License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

```

```
