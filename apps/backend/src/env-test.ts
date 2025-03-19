#!/usr/bin/env bun

/**
 * Environment Test Script
 *
 * This script tests that our environment configuration is working correctly.
 * Run with: bun run src/env-test.ts
 */

import { config } from '@wavefunc/common'

console.log('🔍 Backend Environment Configuration Test')
console.log('=======================================')
console.log('')

console.log('🌐 Application Environment:')
console.log(`  Environment: ${config.app.env}`)
console.log(`  Is Production: ${config.app.isProd}`)
console.log(`  Is Development: ${config.app.isDev}`)
console.log('')

console.log('🖥️ Server Configuration:')
console.log(`  Host: ${config.server.host}`)
console.log(`  Port: ${config.server.port}`)
console.log('')

console.log('🗄️ Primary Database:')
console.log(`  Host: ${config.databases.primary.host}`)
console.log(`  Port: ${config.databases.primary.port}`)
console.log(`  User: ${config.databases.primary.user}`)
console.log(`  Database: ${config.databases.primary.database}`)
console.log(`  Connection String: ${maskConnectionString(config.databases.primary.connectionString)}`)
console.log('')

console.log('🗄️ Secondary Database:')
console.log(`  Host: ${config.databases.secondary.host}`)
console.log(`  Port: ${config.databases.secondary.port}`)
console.log(`  User: ${config.databases.secondary.user}`)
console.log(`  Database: ${config.databases.secondary.database}`)
console.log(`  Connection String: ${maskConnectionString(config.databases.secondary.connectionString)}`)
console.log('')

console.log('📡 Relay Configuration:')
console.log(`  Port: ${config.relay.port}`)
console.log(`  Public Key: ${config.relay.pubkey}`)
console.log(`  Contact: ${config.relay.contact}`)
console.log('')

console.log('🔑 DVM Configuration:')
console.log(`  Private Key: ${maskString(config.dvm.privateKey)}`)
console.log('')

console.log('🎵 AudD Configuration:')
console.log(`  API Token: ${maskString(config.audd.apiToken)}`)
console.log('')

console.log('🌐 External Services:')
console.log(`  Blossom URL: ${config.services.blossom.url}`)
console.log('')

console.log('✅ Backend environment configuration test completed successfully!')

/**
 * Masks a connection string to hide sensitive information
 */
function maskConnectionString(connectionString: string): string {
    return connectionString.replace(/:([^:@]+)@/, ':****@')
}

/**
 * Masks a string to hide sensitive information
 */
function maskString(str: string): string {
    if (!str) return '(not set)'
    if (str.length <= 8) return '****'
    return str.substring(0, 4) + '****' + str.substring(str.length - 4)
}
