# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WaveFunc Radio is a Nostr-based internet radio directory and player with full-text search capabilities. The architecture consists of:

- **Frontend**: React 19 + TypeScript + Tailwind CSS (in `src/`)
- **Relay**: Go-based Nostr relay with SQLite storage and full-text search (in `relay/`)
- **ContextVM**: Metadata server for radio streams (in `contextvm/`)
- **Scripts**: Data migration and seeding utilities (in `scripts/`)

## Development Commands

### Core Development
- `bun dev` - Start relay, migrate 500 real stations, and run development server
- `bun dev:fake` - Start relay with fake test data instead of real stations
- `bun dev:no-seed` - Start relay and frontend without seeding data
- `bun dev:frontend` - Start only the frontend server
- `bun --hot src/index.tsx` - Start frontend with hot reload

### Relay Management
- `bun run relay` - Start the Nostr relay (port 3334)
- `bun run relay:reset` - Reset database and search index

### Data Management
- `bun run migrate` - Migrate 500 random stations from legacy database
- `bun run seed` - Seed the relay with fake test data

### Build and Production
- `bun build` - Build for production using custom build script
- `bun start` - Run in production mode

### ContextVM (Metadata Server)
- `bun run contextvm` - Start metadata server for radio streams

## Architecture

### Multi-Component System
The application requires multiple services running simultaneously:
1. **Go Nostr Relay** (port 3334) - Handles Nostr events with SQLite storage and Bluge full-text search
2. **React Frontend** - NDK-based client for station discovery and playback
3. **ContextVM** - MCP-based metadata server for stream information

### Event System (Nostr)
Radio stations are stored as kind 31237 events following the NIP-XX Internet Radio standard:
- `d` tag for station identifier
- JSON content with description, streams array, and optional streamingServerUrl
- Tags for name, country, language, genre, etc.

### Audio Player Architecture
- Zustand store (`src/stores/playerStore.ts`) manages global playback state
- Supports multiple formats: MP3, AAC, OGG, HLS streams (.m3u8)
- Uses native HTML5 Audio API with HLS.js fallback for streaming

### Key Classes and Patterns
- `NDKStation` class (`src/lib/NDKStation.ts`) wraps Nostr events with validation
- Custom hooks in `src/lib/hooks/useStations.ts` for data fetching
- shadcn/ui components in `src/components/ui/`

## Technology Stack

### Runtime and Tooling
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.
