import { serve } from "@hono/node-server";
import { formatPhoneNumber, isValidEmail } from "@wavefunc/common";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";
import { config } from "./config";
import { developmentService } from "./services/development";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Development routes - only available in development
if (config.isDevelopment) {
  app.post("/development/seed", async (c) => {
    const result = await developmentService.seedData();
    return c.json(result);
  });

  app.post("/development/nuke", async (c) => {
    const result = await developmentService.nukeData();
    return c.json(result);
  });

  app.post("/development/reset", async (c) => {
    const result = await developmentService.resetData();
    return c.json(result);
  });
} else {
  const devRouteHandler = (c: any) =>
    c.json({ error: "Development routes not available in production" }, 404);
  app.post("/development/*", devRouteHandler);
}

// Routes
app.get("/", (c) => {
  return c.json({
    message: "Hello from Hono!",
    status: "ok",
  });
});

app.get("/api/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

const ValidateRequestSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

app.post("/api/validate", async (c) => {
  const body = await c.req.json();
  const result = ValidateRequestSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: result.error.issues }, 400);
  }

  const { email, phone } = result.data;

  return c.json({
    isValidEmail: email ? isValidEmail(email) : false,
    formattedPhone: phone ? formatPhoneNumber(phone) : "",
  });
});

// Start the server
const port = config.port;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
