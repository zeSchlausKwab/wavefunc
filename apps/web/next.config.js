// @ts-check

const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Load environment variables from root .env file, excluding protected ones
    ...Object.fromEntries(
      Object.entries(
        require("dotenv").config({
          path: path.join(__dirname, "../../.env"),
        }).parsed || {}
      ).filter(([key]) => !["NODE_ENV"].includes(key))
    ),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "*",
      },
      {
        protocol: "http",
        hostname: "*",
      },
    ],
  },
};

module.exports = nextConfig;
