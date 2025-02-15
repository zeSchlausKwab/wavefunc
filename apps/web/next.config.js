// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_LOCAL_MACHINE_IP: process.env.NEXT_PUBLIC_LOCAL_MACHINE_IP,
  },
}

module.exports = nextConfig
