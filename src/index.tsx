import { serve, file } from "bun";
import { join } from "path";
import { verifyNIP98Auth } from "./lib/nip98";
import { getPublicKey } from "nostr-tools/pure";
import { hexToBytes } from "@noble/hashes/utils";

const isProduction = process.env.NODE_ENV === "production";

console.log(
  `Starting server in ${isProduction ? "production" : "development"} mode`
);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

// Get the expected pubkey for migration auth
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;
const EXPECTED_PUBKEY = APP_PRIVATE_KEY
  ? getPublicKey(hexToBytes(APP_PRIVATE_KEY))
  : undefined;

// Simple in-memory rate limiting for migration endpoint
const migrationLock = { isRunning: false, lastRun: 0 };

// Define route handlers that work in both modes
const apiRoutes: Record<string, any> = {
  "/api/hello": {
    async GET(req) {
      return Response.json({
        message: "Hello, world!",
        method: "GET",
      });
    },
    async PUT(req) {
      return Response.json({
        message: "Hello, world!",
        method: "PUT",
      });
    },
  },

  "/api/hello/:name": async (req) => {
    const name = req.params.name;
    return Response.json({
      message: `Hello, ${name}!`,
    });
  },

  "/api/migrate": {
    async POST(req: Request) {
      // Check if migration is already running (prevent concurrent migrations)
      if (migrationLock.isRunning) {
        return Response.json(
          { error: "Migration already in progress" },
          { status: 429 }
        );
      }

      // Rate limit: minimum 60 seconds between migrations
      const now = Date.now();
      if (now - migrationLock.lastRun < 60000) {
        return Response.json(
          { error: "Please wait before starting another migration" },
          { status: 429 }
        );
      }

      // Verify NIP-98 authentication
      const authHeader = req.headers.get("Authorization");
      const url = new URL(req.url);

      // Handle reverse proxy (Caddy sends X-Forwarded-Proto)
      const proto =
        req.headers.get("X-Forwarded-Proto") || url.protocol.replace(":", "");
      const host = req.headers.get("X-Forwarded-Host") || url.host;
      const fullUrl = `${proto}://${host}${url.pathname}`;

      // Parse request body for validation
      const bodyText = await req.text();
      const body = bodyText ? JSON.parse(bodyText) : undefined;

      // Verify NIP-98 auth token
      const authEvent = await verifyNIP98Auth(
        authHeader,
        fullUrl,
        "POST",
        EXPECTED_PUBKEY,
        body
      );

      if (!authEvent) {
        return Response.json(
          { error: "Unauthorized - Invalid NIP-98 authentication" },
          { status: 401 }
        );
      }

      // Set migration lock
      migrationLock.isRunning = true;
      migrationLock.lastRun = now;

      // Parse request body for migration parameters
      let count = 500;
      let relayUrl = process.env.RELAY_URL || "ws://localhost:3334";
      let reset = false;

      // Validate and sanitize inputs
      if (body?.count) {
        const parsedCount = parseInt(body.count);
        // Limit to reasonable range to prevent DoS
        if (!isNaN(parsedCount) && parsedCount > 0 && parsedCount <= 100000) {
          count = parsedCount;
        }
      }

      if (body?.relayUrl) {
        // Validate relay URL format (must be ws:// or wss://)
        const urlStr = body.relayUrl.toString();
        if (
          urlStr.match(
            /^wss?:\/\/[a-zA-Z0-9.-]+(:[0-9]+)?(\/[a-zA-Z0-9._-]*)?$/
          )
        ) {
          relayUrl = urlStr;
        } else {
          return Response.json(
            { error: "Invalid relay URL format" },
            { status: 400 }
          );
        }
      }

      if (body?.reset === true) {
        reset = true;
      }

      // Reset relay if requested
      if (reset) {
        console.log("⚠️  Resetting relay...");

        // Kill relay process(es)
        try {
          // Kill processes on port 3334
          await Bun.spawn([
            "bash",
            "-c",
            "lsof -ti:3334 | xargs kill -9 2>/dev/null || true",
          ]).exited;

          // Kill any go run relay processes
          await Bun.spawn(["pkill", "-f", "go run.*relay"], {
            stderr: "ignore",
            stdout: "ignore",
          }).exited;

          console.log("✅ Relay processes killed");
        } catch (error) {
          console.log(
            "⚠️  Could not kill relay processes (may not be running)"
          );
        }

        // Delete database and search index
        try {
          const fs = await import("fs/promises");
          const path = await import("path");

          const dbPath = path.join(process.cwd(), "relay/data/events.db");
          const searchPath = path.join(process.cwd(), "relay/data/search");

          await fs.rm(dbPath, { force: true });
          await fs.rm(searchPath, { recursive: true, force: true });
          await fs.mkdir(searchPath, { recursive: true });

          console.log("✅ Database and search index deleted");
        } catch (error) {
          console.log("⚠️  Could not delete database files:", error);
        }

        // Small delay to ensure cleanup is complete
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Run migration in background
      const migrationProc = Bun.spawn(
        [
          "bun",
          "run",
          "scripts/migrate_legacy.ts",
          count.toString(),
          `--relay=${relayUrl}`,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            APP_PRIVATE_KEY: APP_PRIVATE_KEY || "",
            RELAY_URL: relayUrl,
          },
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      // Stream output back to client
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          // Read stdout
          const reader = migrationProc.stdout.getReader();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(
                encoder.encode(new TextDecoder().decode(value))
              );
            }
          } catch (error) {
            controller.enqueue(encoder.encode(`\nError: ${error}\n`));
          }

          // Wait for process to complete
          const exitCode = await migrationProc.exited;
          controller.enqueue(
            encoder.encode(
              `\nMigration completed with exit code: ${exitCode}\n`
            )
          );
          controller.close();

          // Release migration lock
          migrationLock.isRunning = false;
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
        },
      });
    },
  },

  "/api/app-pubkey": {
    async GET() {
      return Response.json({
        pubkey: EXPECTED_PUBKEY || null,
      });
    },
  },
};

// Add debug endpoints in development only
if (!isProduction) {
  apiRoutes["/api/debug/pubkey"] = {
    async GET() {
      return Response.json({
        hasPrivateKey: !!APP_PRIVATE_KEY,
        expectedPubkey: EXPECTED_PUBKEY || "NOT SET",
        nodeEnv: process.env.NODE_ENV,
      });
    },
  };

  apiRoutes["/api/debug/nip98"] = {
    async POST(req: Request) {
      const authHeader = req.headers.get("Authorization");
      const url = new URL(req.url);

      const proto =
        req.headers.get("X-Forwarded-Proto") || url.protocol.replace(":", "");
      const host = req.headers.get("X-Forwarded-Host") || url.host;
      const fullUrl = `${proto}://${host}${url.pathname}`;

      const authEvent = await verifyNIP98Auth(
        authHeader,
        fullUrl,
        "POST",
        EXPECTED_PUBKEY
      );

      return Response.json({
        success: !!authEvent,
        fullUrl,
        expectedPubkey: EXPECTED_PUBKEY,
        authEventPubkey: authEvent?.pubkey,
      });
    },
  };
}

// Start server
(async () => {
  if (isProduction) {
    // Production: Serve static files from dist/ and public/
    const server = serve({
      routes: {
        ...apiRoutes,
        "/*": async (req) => {
          const url = new URL(req.url);
          const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

          // Try to serve from public/ first (for static assets like images)
          const publicPath = join(process.cwd(), "public", pathname);
          const publicFile = file(publicPath);

          if (await publicFile.exists()) {
            return new Response(publicFile);
          }

          // Try to serve from dist/ (built assets)
          const filePath = join(process.cwd(), "dist", pathname);
          const staticFile = file(filePath);

          if (await staticFile.exists()) {
            return new Response(staticFile);
          }

          // If file not found, serve index.html for client-side routing
          return new Response(file(join(process.cwd(), "dist", "index.html")));
        },
      },
    });

    console.log(`🚀 Server running at ${server.url} (production)`);
  } else {
    // Development: Use Bun's bundler with HMR
    const index = (await import("./index.html")).default;

    const server = serve({
      routes: {
        ...apiRoutes,
        // Serve static files from public/ directory
        "/images/*": async (req) => {
          const url = new URL(req.url);
          const filePath = join(process.cwd(), "public", url.pathname);
          const staticFile = file(filePath);

          if (await staticFile.exists()) {
            return new Response(staticFile);
          }

          return new Response("Not found", { status: 404 });
        },
        // Catch-all for SPA routing
        "/*": index,
      },

      development: {
        hmr: true,
        console: true,
      },
    });

    console.log(`🚀 Server running at ${server.url} (development)`);
  }
})();
