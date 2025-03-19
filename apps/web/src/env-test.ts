#!/usr/bin/env bun

import { config } from '@wavefunc/common'

console.log('🔍 Web App Environment Configuration Test')
console.log('========================================')
console.log('')

console.log('🌐 Application Environment:')
console.log(`  Environment: ${config.app.env}`)
console.log(`  Is Production: ${config.app.isProd}`)
console.log(`  Is Development: ${config.app.isDev}`)
console.log('')

console.log('🖥️ Server Configuration:')
console.log(`  Host: ${config.server.host}`)
console.log(`  API Port: ${config.server.port}`)
console.log(`  Web Port: ${process.env.PUBLIC_WEB_PORT || '8080 (default)'}`)
console.log('')

console.log('🔌 API Endpoints:')
console.log(`  Backend API: http://${config.server.host}:${config.server.port}`)
console.log(`  Relay WebSocket: ws://${config.server.host}:${config.relay.port}`)
console.log('')

console.log('🌐 External Services:')
console.log(`  Blossom URL: ${config.services.blossom.url}`)
console.log('')

// Check if the web app can access all required environment variables
console.log('🧪 Environment Variable Check:')
const requiredVars = ['PUBLIC_APP_ENV', 'PUBLIC_HOST', 'PUBLIC_API_PORT', 'PUBLIC_WEB_PORT', 'PUBLIC_BLOSSOM_URL']

let allVarsPresent = true
for (const varName of requiredVars) {
    const isPresent = process.env[varName] !== undefined
    console.log(`  ${varName}: ${isPresent ? '✅' : '❌'}`)
    if (!isPresent) allVarsPresent = false
}
console.log('')

if (allVarsPresent) {
    console.log('✅ Web app environment configuration test completed successfully!')
} else {
    console.log('⚠️ Some environment variables are missing. Check the configuration.')
}
