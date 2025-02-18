import path from "path";
import dotenv from "dotenv";

// Load environment variables from root
dotenv.config({
  path: path.join(process.cwd(), ".env"),
});

export const config = {
  isDevelopment: process.env.NEXT_PUBLIC_APP_ENV !== "production",
  port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
};
