import path from "path";
import dotenv from "dotenv";

// Load environment variables from root
dotenv.config({
  path: path.join(__dirname, "../../../.env"),
});

export const config = {
  isDevelopment: process.env.NEXT_PUBLIC_APP_ENV !== "production",
  port:
    process.env.NEXT_PUBLIC_API_PORT ?
      parseInt(process.env.NEXT_PUBLIC_API_PORT)
    : 3001,
};
