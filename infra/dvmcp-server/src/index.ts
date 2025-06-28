import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env file for local development only
const projectRoot = path.resolve(__dirname, '../../../')
const envPath = path.join(projectRoot, '.env')

if (fs.existsSync(envPath)) {
    console.log('Loading .env file for local development')
    const { default: dotenv } = await import('dotenv')
    dotenv.config({ path: envPath })
} else {
    console.log('Using environment variables from deployment platform')
}

async function startDVMCPBridge() {
    const requiredEnvVars = [
        'DVM_PRIVATE_KEY',
        'DVM_RELAY_URLS',
        'AUDD_API_TOKEN',
        'DISCOGS_PA_TOKEN',
        'DVM_LIGHTNING_ADDRESS',
        'DVM_LIGHTNING_ZAP_RELAYS',
    ]

    console.log('Environment check:')
    for (const varName of requiredEnvVars) {
        const isSet = !!process.env[varName]
        console.log(`- ${varName}: ${isSet ? '✓ Set' : '✗ Missing'}`)
        if (!isSet) {
            console.error(`ERROR: ${varName} environment variable is required`)
            process.exit(1)
        }
    }

    const relayUrls = process.env.DVM_RELAY_URLS!
    const privateKey = process.env.DVM_PRIVATE_KEY!
    const lightningAddress = process.env.DVM_LIGHTNING_ADDRESS!
    const zapRelays = process.env.DVM_LIGHTNING_ZAP_RELAYS!

    const configPath = path.join(__dirname, '../config.dvmcp.yml')
    const processedConfigPath = path.join(__dirname, '../config.processed.yml')

    // Read the config file and replace environment variables
    const configContent = fs.readFileSync(configPath, 'utf8')

    // Find the full path to bun executable
    const bunPath = process.env.BUN_INSTALL
        ? `${process.env.BUN_INSTALL}/bin/bun`
        : process.execPath.includes('bun')
          ? process.execPath
          : 'bun'

    console.log(`Using bun path: ${bunPath}`)

    const processedConfig = configContent
        .replace(/\$\{DVM_PRIVATE_KEY\}/g, privateKey)
        .replace(/\$\{DVM_LIGHTNING_ADDRESS\}/g, lightningAddress)
        .replace(/\$\{AUDD_API_TOKEN\}/g, process.env.AUDD_API_TOKEN || '')
        .replace(/\$\{DISCOGS_PA_TOKEN\}/g, process.env.DISCOGS_PA_TOKEN || '')
        .replace(/command: 'bun'/g, `command: '${bunPath}'`)

    // Write the processed config to a temporary file
    fs.writeFileSync(processedConfigPath, processedConfig)

    const args = [
        'dvmcp-bridge',
        '--config-path',
        processedConfigPath,
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
        // Clean up the temporary config file
        if (fs.existsSync(processedConfigPath)) {
            fs.unlinkSync(processedConfigPath)
        }
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
