import dotenv from 'dotenv'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: '../../.env' })

async function startDVMCPBridge() {
    const requiredEnvVars = [
        'DVM_PRIVATE_KEY',
        'DVM_RELAY_URLS',
        'AUDD_API_TOKEN',
        'DVM_LIGHTNING_ADDRESS',
        'DVM_LIGHTNING_ZAP_RELAYS',
    ]

    for (const varName of requiredEnvVars) {
        if (!process.env[varName]) {
            console.error(`${varName} environment variable is required`)
            process.exit(1)
        }
    }

    const relayUrls = process.env.DVM_RELAY_URLS!
    const privateKey = process.env.DVM_PRIVATE_KEY!
    const lightningAddress = process.env.DVM_LIGHTNING_ADDRESS!
    const zapRelays = process.env.DVM_LIGHTNING_ZAP_RELAYS!

    const configPath = path.join(__dirname, '../config.dvmcp.yml')

    const args = [
        'dvmcp-bridge',
        '--config-path',
        configPath,
        '--verbose',
        '--nostr.privateKey',
        privateKey,
        // '--nostr.relayUrls',
        // relayUrls,
        // '--lightning.address',
        // lightningAddress,
        // '--lightning.zapRelays',
        // zapRelays,
    ]

    console.log('Command:', 'bunx', args.join(' '))

    const bridge = spawn('bunx', args, {
        stdio: 'inherit',
        env: process.env,
    })

    // Handle process termination
    const cleanup = () => {
        console.log('\nShutting down DVMCP bridge...')
        bridge.kill()
        process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    bridge.on('error', (error) => {
        console.error('DVMCP Bridge error:', error)
        cleanup()
    })

    bridge.on('exit', (code) => {
        console.log(`DVMCP Bridge exited with code ${code}`)
        process.exit(code || 0)
    })

    console.log('DVMCP Bridge is running. Press Ctrl+C to stop.')
}

// Start the bridge
startDVMCPBridge().catch((error) => {
    console.error('Failed to start DVMCP bridge:', error)
    process.exit(1)
})
