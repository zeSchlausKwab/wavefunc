import { serve, file } from "bun";
import { join } from "path";

const isProduction = process.env.NODE_ENV === "production";

console.log(`Starting server in ${isProduction ? 'production' : 'development'} mode`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

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
