# Wavefunc SSR

A server-side rendered React application using Bun.

## Features

- Server-side rendering with React and Bun
- Client-side hydration
- TanStack Router for page navigation
- Fast performance with Bun's runtime

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed

### Installation

1. Install dependencies:
```bash
bun install
```

2. Build the client bundle:
```bash
bun run build
```

3. Start the development server:
```bash
bun run dev
```

The application will be available at http://localhost:3300

## Available Scripts

- `bun run dev` - Start the development server with hot reloading
- `bun run build` - Build the client-side bundle
- `bun run start` - Start the production server

## Structure

- `src/server.tsx` - The Bun server that handles SSR
- `src/client.tsx` - Client-side entry point for hydration
- `src/router.tsx` - TanStack Router configuration
- `src/pages/` - Page components
- `public/` - Static assets

## Build Process

The build process uses Bun's built-in bundler to create client-side JavaScript:

1. Client-side code is bundled from `src/client.tsx` into `public/build/client.js`
2. CSS is copied from `src/styles.css` to `public/build/styles.css`
3. The server reads these files when serving the application

The `public/build` directory is excluded from Git, as these are build artifacts. Build the application locally before starting the server. 