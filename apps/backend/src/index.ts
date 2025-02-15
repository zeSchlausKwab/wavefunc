import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import {
  isValidEmail,
  formatPhoneNumber,
  PublicKeySchema,
  UserContactsSchema,
} from "@wavefunc/common";
import { z } from "zod";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

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
const port = 3001;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
