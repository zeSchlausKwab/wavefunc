import { serve, file } from "bun";
import { join } from "path";
import { verifyNIP98Auth } from "./lib/nip98";
import { getPublicKey } from "nostr-tools/pure";
import { hexToBytes } from "@noble/hashes/utils";

const isProduction = process.env.NODE_ENV === "production";

console.log(`Starting server in ${isProduction ? 'production' : 'development'} mode`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

// Get the expected pubkey for migration auth
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;
const EXPECTED_PUBKEY = APP_PRIVATE_KEY ? getPublicKey(hexToBytes(APP_PRIVATE_KEY)) : undefined;

// Define route handlers that work in both modes
const apiRoutes = {
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

  "/api/debug/pubkey": {
    async GET() {
      return Response.json({
        hasPrivateKey: !!APP_PRIVATE_KEY,
        expectedPubkey: EXPECTED_PUBKEY || "NOT SET",
        nodeEnv: process.env.NODE_ENV,
      });
    },
  },

  "/api/debug/nip98": {
    async POST(req: Request) {
      const authHeader = req.headers.get("Authorization");
      const url = new URL(req.url);

      // Handle reverse proxy
      const proto = req.headers.get("X-Forwarded-Proto") || url.protocol.replace(":", "");
      const host = req.headers.get("X-Forwarded-Host") || url.host;
      const fullUrl = `${proto}://${host}${url.pathname}`;

      console.log("\n=== NIP-98 Debug Request ===");
      console.log("Request URL:", req.url);
      console.log("Parsed Full URL:", fullUrl);
      console.log("Protocol:", url.protocol);
      console.log("Host:", url.host);
      console.log("Pathname:", url.pathname);
      console.log("Expected Pubkey:", EXPECTED_PUBKEY);
      console.log("Auth Header:", authHeader?.substring(0, 100));

      const authEvent = await verifyNIP98Auth(authHeader, fullUrl, "POST", EXPECTED_PUBKEY, undefined, true);

      return Response.json({
        success: !!authEvent,
        fullUrl,
        expectedPubkey: EXPECTED_PUBKEY,
        authEventPubkey: authEvent?.pubkey,
      });
    },
  },

  "/api/migrate": {
    async POST(req: Request) {
      console.log("\n=== Migration API Request Received ===");

      // Verify NIP-98 authentication
      const authHeader = req.headers.get("Authorization");
      const url = new URL(req.url);

      // Handle reverse proxy (Caddy sends X-Forwarded-Proto)
      const proto = req.headers.get("X-Forwarded-Proto") || url.protocol.replace(":", "");
      const host = req.headers.get("X-Forwarded-Host") || url.host;
      const fullUrl = `${proto}://${host}${url.pathname}`;

      console.log("Full URL:", fullUrl);
      console.log("Expected Pubkey:", EXPECTED_PUBKEY);
      console.log("Has Auth Header:", !!authHeader);

      // Parse request body for validation
      const bodyText = await req.text();
      const body = bodyText ? JSON.parse(bodyText) : undefined;

      console.log("Body:", body);

      // Always enable debug for now
      const authEvent = await verifyNIP98Auth(authHeader, fullUrl, "POST", EXPECTED_PUBKEY, body, true);

      if (!authEvent) {
        console.log("❌ Authentication failed");
        return Response.json(
          { error: "Unauthorized - Invalid NIP-98 authentication" },
          { status: 401 }
        );
      }

      console.log("✅ Authentication successful");
      console.log("Authenticated Pubkey:", authEvent.pubkey);

      // Parse request body for migration parameters
      let count = 500;
      let relayUrl = process.env.RELAY_URL || "ws://localhost:3334";

      if (body?.count) count = parseInt(body.count);
      if (body?.relayUrl) relayUrl = body.relayUrl;

      // Run migration in background
      const migrationProc = Bun.spawn([
        "bun",
        "run",
        "scripts/migrate_legacy.ts",
        count.toString(),
        `--relay=${relayUrl}`
      ], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APP_PRIVATE_KEY: APP_PRIVATE_KEY || "",
          RELAY_URL: relayUrl,
        },
        stdout: "pipe",
        stderr: "pipe",
      });

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
              controller.enqueue(encoder.encode(new TextDecoder().decode(value)));
            }
          } catch (error) {
            controller.enqueue(encoder.encode(`\nError: ${error}\n`));
          }

          // Wait for process to complete
          const exitCode = await migrationProc.exited;
          controller.enqueue(encoder.encode(`\nMigration completed with exit code: ${exitCode}\n`));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
        },
      });
    },
  },
};

// Start server
(async () => {
  if (isProduction) {
    // Production: Serve static files from dist/
    const server = serve({
      routes: {
        "/*": async (req) => {
          const url = new URL(req.url);
          const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
          const filePath = join(process.cwd(), "dist", pathname);

          try {
            return new Response(file(filePath));
          } catch (error) {
            // If file not found, serve index.html for client-side routing
            return new Response(file(join(process.cwd(), "dist", "index.html")));
          }
        },
        ...apiRoutes,
      },
    });

    console.log(`🚀 Server running at ${server.url} (production)`);
  } else {
    // Development: Use Bun's bundler with HMR
    const index = (await import("./index.html")).default;

    const server = serve({
      routes: {
        "/*": index,
        ...apiRoutes,
      },

      development: {
        hmr: true,
        console: true,
      },
    });

    console.log(`🚀 Server running at ${server.url} (development)`);
  }
})();
