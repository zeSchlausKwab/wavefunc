#!/usr/bin/env bun

import { config } from '@wavefunc/common'

console.log('🔍 DVM Environment Configuration Test')
console.log('===================================')
console.log('')

console.log('🌐 Application Environment:')
console.log(`  Environment: ${config.app.env}`)
console.log(`  Is Production: ${config.app.isProd}`)
console.log(`  Is Development: ${config.app.isDev}`)
console.log('')

console.log('🔑 DVM Configuration:')
console.log(`  Private Key: ${maskString(config.dvm.privateKey)}`)
console.log('')

console.log('🎵 AudD Configuration:')
console.log(`  API Token: ${maskString(config.audd.apiToken)}`)
console.log('')

console.log('🔌 API Endpoints:')
console.log(`  Backend API: http://${config.server.host}:${config.server.port}`)
console.log(`  Relay WebSocket: ws://${config.server.host}:${config.relay.port}`)
console.log('')

// Check if the DVM can access all required environment variables
console.log('🧪 Environment Variable Check:')
const requiredVars = ['PUBLIC_APP_ENV', 'PUBLIC_HOST', 'DVM_PRIVATE_KEY', 'AUDD_API_TOKEN']

let allVarsPresent = true
for (const varName of requiredVars) {
    const isPresent = process.env[varName] !== undefined
    console.log(`  ${varName}: ${isPresent ? '✅' : '❌'}`)
    if (!isPresent) allVarsPresent = false
}
console.log('')

if (allVarsPresent) {
    console.log('✅ DVM environment configuration test completed successfully!')
} else {
    console.log('⚠️ Some environment variables are missing. Check the configuration.')
}

/**
 * Masks a string to hide sensitive information
 */
function maskString(str: string): string {
    if (!str) return '(not set)'
    if (str.length <= 8) return '****'
    return str.substring(0, 4) + '****' + str.substring(str.length - 4)
}
