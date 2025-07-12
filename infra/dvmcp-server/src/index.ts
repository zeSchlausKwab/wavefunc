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
    process.stderr.write('[DVMCP] Loading .env file for local development\n')
    const { default: dotenv } = await import('dotenv')
    dotenv.config({ path: envPath })
} else {
    process.stderr.write('[DVMCP] Using environment variables from deployment platform\n')
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

    process.stderr.write('[DVMCP] Environment check:\n')
    for (const varName of requiredEnvVars) {
        const isSet = !!process.env[varName]
        process.stderr.write(`[DVMCP] - ${varName}: ${isSet ? '✓ Set' : '✗ Missing'}\n`)
        if (!isSet) {
            process.stderr.write(`[DVMCP] ERROR: ${varName} environment variable is required\n`)
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

    process.stderr.write(`[DVMCP] Using bun path: ${bunPath}\n`)

    const processedConfig = configContent
        .replace(/\$\{DVM_PRIVATE_KEY\}/g, privateKey)
        .replace(/\$\{DVM_LIGHTNING_ADDRESS\}/g, lightningAddress)
        .replace(/\$\{AUDD_API_TOKEN\}/g, process.env.AUDD_API_TOKEN || '')
        .replace(/\$\{DISCOGS_PA_TOKEN\}/g, process.env.DISCOGS_PA_TOKEN || '')
        .replace(/command: 'bun'/g, `command: '${bunPath}'`)

    // Write the processed config to a temporary file
    fs.writeFileSync(processedConfigPath, processedConfig)
    process.stderr.write(`[DVMCP] Wrote processed config to: ${processedConfigPath}\n`)

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

    process.stderr.write(`[DVMCP] Command: bunx ${args.join(' ')}\n`)

    const bridge = spawn('bunx', args, {
        stdio: 'inherit',
        env: process.env,
    })

    // Handle process termination
    const cleanup = () => {
        process.stderr.write('[DVMCP] Shutting down DVMCP bridge...\n')
        bridge.kill()
        // Clean up the temporary config file
        if (fs.existsSync(processedConfigPath)) {
            fs.unlinkSync(processedConfigPath)
            process.stderr.write('[DVMCP] Cleaned up temporary config file\n')
        }
        process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    bridge.on('error', (error) => {
        process.stderr.write(`[DVMCP] Bridge error: ${error}\n`)
        cleanup()
    })

    bridge.on('exit', (code) => {
        process.stderr.write(`[DVMCP] Bridge exited with code ${code}\n`)
        process.exit(code || 0)
    })

    process.stderr.write('[DVMCP] Bridge is running. Press Ctrl+C to stop.\n')
}

// Start the bridge
startDVMCPBridge().catch((error) => {
    process.stderr.write(`[DVMCP] Failed to start DVMCP bridge: ${error}\n`)
    process.exit(1)
})
