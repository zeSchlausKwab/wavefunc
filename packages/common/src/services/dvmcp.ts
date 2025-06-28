/**
 * DVMCP (Data Vending Machine Control Protocol) Service
 *
 * This service automatically discovers DVMCP servers that provide music recognition
 * and other tools during initialization, eliminating the need for manual discovery
 * when users interact with DVMCP features.
 *
 * Features:
 * - Automatic server discovery on initialization
 * - Fallback to known servers if discovery fails
 * - Background discovery without blocking user interactions
 * - Status tracking for UI indicators
 * - Integration with NWC payments for automatic fee handling
 */

import NDK, { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import type { RecognitionResult } from '../types/recognition'
import { NDKNWCWallet } from '@nostr-dev-kit/ndk-wallet'
import { ndkActions } from '../lib/store/ndk'

// Updated event kinds for DVMCP 2025-03-26 specification
const JOB_KIND = 25910 // DVMCP job request (updated)
const RESULT_KIND = 26910 // DVMCP result (updated)
const FEEDBACK_KIND = 21316 // DVMCP feedback (same)

// Server announcement kinds for discovery
const SERVER_ANNOUNCEMENT_KIND = 31316
const TOOLS_LIST_KIND = 31317

export interface DVMCPResponse {
    type: 'audd_response' | 'audd_error' | 'music_recognition_result' | 'music_recognition_error'
    result?: RecognitionResult
    error?: string
    error_code?: number
}

export interface PaymentDetails {
    amount: string
    invoice?: string
    paid: boolean
}

export interface PaymentHandler {
    (amount: string, invoice: string): Promise<boolean>
}

export class DVMCPService {
    private ndk: NDK
    private serverIdentifier: string
    private providerPubkey: string
    private paymentHandler?: PaymentHandler

    constructor(ndk: NDK, serverIdentifier: string = 'wavefunc-dvmcp-bridge', providerPubkey?: string) {
        const ndk2 = ndkActions.getNDK()
        if (!ndk2) {
            throw new Error('NDK not available')
        }
        this.ndk = ndk2
        this.serverIdentifier = serverIdentifier
        this.providerPubkey = providerPubkey || '' // Will be discovered if not provided
    }

    /**
     * Set a custom payment handler for automatic payments
     */
    setPaymentHandler(handler: PaymentHandler) {
        this.paymentHandler = handler
    }

    /**
     * Handle payment request by attempting to pay with custom handler or fallback to manual
     */
    private async handlePaymentRequest(amount: string, invoice?: string): Promise<boolean> {
        try {
            if (!invoice) {
                console.error('[DVMCP] No invoice provided for payment')
                return false
            }

            // Try custom payment handler first (e.g., NWC wallet)
            if (this.paymentHandler) {
                console.log(`[DVMCP] Attempting automatic payment of ${amount} sats...`)

                try {
                    const paymentSuccess = await this.paymentHandler(amount, invoice)
                    if (paymentSuccess) {
                        console.log('[DVMCP] Automatic payment successful!')
                        return true
                    } else {
                        console.log('[DVMCP] Automatic payment failed, falling back to manual')
                    }
                } catch (error) {
                    console.error('[DVMCP] Automatic payment error:', error)
                }
            }

            // Fallback to manual payment
            console.log('[DVMCP] No automatic payment available. Manual payment required.')
            this.logManualPaymentRequired(amount, invoice || '')
            return false
        } catch (error) {
            console.error('[DVMCP] Payment error:', error)
            this.logManualPaymentRequired(amount, invoice || '')
            return false
        }
    }

    /**
     * Log manual payment requirement (no dialogs)
     */
    private logManualPaymentRequired(amount: string, invoice: string) {
        console.log('[DVMCP] Manual payment required:', {
            amount: `${amount} sats`,
            invoice: invoice.substring(0, 20) + '...',
            note: 'Payment will be handled by UI',
        })
    }

    /**
     * Set the provider pubkey and server identifier
     */
    setProvider(pubkey: string, serverIdentifier?: string) {
        this.providerPubkey = pubkey
        if (serverIdentifier) {
            this.serverIdentifier = serverIdentifier
        }
    }

    /**
     * Discover DVMCP providers by listening to server announcements
     */
    async discoverProviders(timeout: number = 10000): Promise<void> {
        console.log('[DVMCP] Starting provider discovery...')

        return new Promise<void>((resolve, reject) => {
            let foundServers = 0
            const discoveryTimeout = setTimeout(() => {
                sub.stop()
                console.log(
                    `[DVMCP] Discovery timeout after ${timeout}ms. Found ${foundServers} servers but none were compatible.`,
                )
                reject(new Error(`Discovery timeout: Found ${foundServers} servers but none were compatible`))
            }, timeout)

            const sub = this.ndk.subscribe({
                kinds: [SERVER_ANNOUNCEMENT_KIND as NDKKind],
                limit: 10,
            })

            sub.on('event', (event) => {
                try {
                    foundServers++
                    console.log(`[DVMCP] Found server announcement #${foundServers}:`, event.pubkey)
                    console.log('[DVMCP] Server announcement content:', event.content)

                    let content: any = {}
                    try {
                        content = JSON.parse(event.content)
                        console.log('[DVMCP] Parsed content:', content)
                        console.log('[DVMCP] Content type:', typeof content)
                        console.log('[DVMCP] Content keys:', Object.keys(content))
                        console.log('[DVMCP] Capabilities type:', typeof content.capabilities)
                        console.log('[DVMCP] Capabilities value:', content.capabilities)
                    } catch (parseError) {
                        console.error('[DVMCP] Failed to parse JSON content:', parseError)
                        console.log('[DVMCP] Raw content:', event.content)
                        return
                    }

                    // Enhanced compatibility check with detailed logging
                    const checks = {
                        identifierMatch: content.identifier === this.serverIdentifier,
                        nameMatch: content.name === this.serverIdentifier,
                        wavefuncMatch:
                            content.identifier === 'wavefunc-dvmcp-bridge' ||
                            content.serverId === 'wavefunc-dvmcp-bridge',
                        capabilitiesArray: Array.isArray(content.capabilities),
                        capabilitiesString: typeof content.capabilities === 'string',
                        hasMusicRecognition: false,
                        hasToolsCall: false,
                        typeMatch:
                            content.type === 'dvmcp-server' || content.type === 'dvmcp' || content.kind === 'dvmcp',
                        pubkeyMatch:
                            event.pubkey === 'f47121cd783802e6d4879e63233b54aff54e6788ea9ef568cec0259cc60fe286',
                        hasTools: false,
                        isWavefuncRelated: false,
                    }

                    // Check capabilities more safely
                    if (Array.isArray(content.capabilities)) {
                        checks.hasMusicRecognition = content.capabilities.includes('music-recognition')
                        checks.hasToolsCall = content.capabilities.includes('tools/call')
                    } else if (typeof content.capabilities === 'string') {
                        checks.hasMusicRecognition = content.capabilities.includes('music-recognition')
                        checks.hasToolsCall = content.capabilities.includes('tools/call')
                    }

                    // Check for tools array (common in DVMCP announcements)
                    if (Array.isArray(content.tools)) {
                        checks.hasTools = true
                        checks.hasMusicRecognition = content.tools.some(
                            (tool: any) =>
                                tool === 'music-recognition' ||
                                tool.name === 'music-recognition' ||
                                tool.includes?.('music-recognition'),
                        )
                    }

                    // Check for Wavefunc-related identifiers
                    const contentStr = JSON.stringify(content).toLowerCase()
                    checks.isWavefuncRelated =
                        contentStr.includes('wavefunc') ||
                        contentStr.includes('dvmcp-bridge') ||
                        contentStr.includes('music-recognition')

                    console.log('[DVMCP] Compatibility checks:', checks)

                    const isCompatible =
                        checks.identifierMatch ||
                        checks.nameMatch ||
                        checks.wavefuncMatch ||
                        checks.hasMusicRecognition ||
                        checks.hasToolsCall ||
                        checks.typeMatch ||
                        checks.pubkeyMatch ||
                        checks.hasTools ||
                        checks.isWavefuncRelated

                    console.log('[DVMCP] Is compatible:', isCompatible)

                    if (isCompatible) {
                        console.log('[DVMCP] Found compatible DVMCP server:', event.pubkey, content)
                        this.setProvider(event.pubkey, content.identifier || content.name || this.serverIdentifier)

                        clearTimeout(discoveryTimeout)
                        sub.stop()
                        resolve()
                    } else {
                        console.log('[DVMCP] Server not compatible - content structure:', {
                            hasIdentifier: 'identifier' in content,
                            hasName: 'name' in content,
                            hasCapabilities: 'capabilities' in content,
                            hasType: 'type' in content,
                            allKeys: Object.keys(content),
                        })
                    }
                } catch (error) {
                    console.error('[DVMCP] Error processing server announcement:', error)
                    console.log('[DVMCP] Raw event content:', event.content)
                    console.log('[DVMCP] Event pubkey:', event.pubkey)
                }
            })

            // Start the subscription
            sub.start()
        })
    }

    /**
     * Call a specific DVMCP tool with arguments
     */
    async callTool(toolName: string, args: Record<string, any>): Promise<any> {
        if (!this.ndk.activeUser) {
            throw new Error('NDK user not available')
        }

        // If we don't have a provider, try to discover it first
        if (!this.providerPubkey) {
            console.log('[DVMCP] No provider set, attempting discovery...')
            try {
                await this.discoverProviders()
                console.log('[DVMCP] Discovery successful, provider set to:', this.providerPubkey)
            } catch (error) {
                console.log('[DVMCP] Discovery failed:', error)
                console.log('[DVMCP] Using fallback server with known pubkey')
                this.setProvider(
                    'f47121cd783802e6d4879e63233b54aff54e6788ea9ef568cec0259cc60fe286',
                    'wavefunc-dvmcp-bridge',
                )
            }
        }

        console.log(`[DVMCP] Calling tool: ${toolName} with provider: ${this.providerPubkey}, args:`, args)

        // Create the DVMCP request event
        const requestEvent = new NDKEvent(this.ndk)
        requestEvent.kind = JOB_KIND
        requestEvent.content = JSON.stringify({
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args,
            },
        })
        requestEvent.tags = [
            ['method', 'tools/call'],
            ['p', this.providerPubkey],
            ['s', this.serverIdentifier],
        ]

        await requestEvent.sign()

        // Subscribe to responses and feedback
        const sub = this.ndk.subscribe({
            kinds: [RESULT_KIND as NDKKind, FEEDBACK_KIND as NDKKind],
            '#e': [requestEvent.id],
            limit: 5,
        })

        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                sub.stop()
                reject(new Error('DVMCP request timed out'))
            }, 30000)

            sub.on('event', async (event: NDKEvent) => {
                try {
                    if (event.kind === FEEDBACK_KIND) {
                        const statusTag = event.tags.find((tag) => tag[0] === 'status')
                        if (statusTag) {
                            const status = statusTag[1]
                            const statusMessage = statusTag[2]
                            console.log(`[DVMCP] Status: ${status}${statusMessage ? ` - ${statusMessage}` : ''}`)

                            if (status === 'payment-required') {
                                console.log('[DVMCP] Payment required status received')
                                const amountTag = event.tags.find((tag) => tag[0] === 'amount')
                                if (amountTag) {
                                    const amount = amountTag[1]
                                    const invoice = amountTag[2]

                                    const paymentSuccess = await this.handlePaymentRequest(amount, invoice)
                                    if (!paymentSuccess) {
                                        clearTimeout(timeout)
                                        sub.stop()
                                        const error = new Error(
                                            `Payment required: ${amount} sats. Please pay the invoice and try again.`,
                                        )
                                        ;(error as any).invoice = invoice
                                        ;(error as any).amount = amount
                                        reject(error)
                                        return
                                    }
                                } else {
                                    clearTimeout(timeout)
                                    sub.stop()
                                    reject(new Error('Payment required but no amount specified'))
                                }
                            } else if (status === 'error') {
                                clearTimeout(timeout)
                                sub.stop()
                                reject(new Error(statusMessage || event.content || 'DVMCP processing error'))
                            }
                        }
                    } else if (event.kind === RESULT_KIND) {
                        const content = JSON.parse(event.content)

                        if (content.error) {
                            clearTimeout(timeout)
                            sub.stop()
                            reject(new Error(content.error.message || 'DVMCP protocol error'))
                            return
                        }

                        if (content.content && Array.isArray(content.content)) {
                            const toolResult = content.content[0]
                            if (toolResult?.text) {
                                const response = JSON.parse(toolResult.text)
                                clearTimeout(timeout)
                                sub.stop()
                                resolve(response)
                            }
                        } else if (content.isError) {
                            clearTimeout(timeout)
                            sub.stop()
                            const errorText = content.content?.[0]?.text || 'Unknown execution error'
                            reject(new Error(errorText))
                        }
                    }
                } catch (error) {
                    console.error('[DVMCP] Event processing error:', error)
                    clearTimeout(timeout)
                    sub.stop()
                    reject(error)
                }
            })

            // Publish the request
            await requestEvent.publish()
        })
    }

    /**
     * Recognize music from an audio URL using DVMCP
     */
    async recognizeSong(audioUrl: string): Promise<RecognitionResult> {
        if (!this.ndk.activeUser) {
            throw new Error('NDK user not available')
        }

        // If we don't have a provider, try to discover it first
        if (!this.providerPubkey) {
            console.log('[DVMCP] No provider set, attempting discovery...')
            try {
                await this.discoverProviders()
                console.log('[DVMCP] Discovery successful, provider set to:', this.providerPubkey)
            } catch (error) {
                console.log('[DVMCP] Discovery failed:', error)
                console.log('[DVMCP] Using fallback server with known pubkey')
                this.setProvider(
                    'f47121cd783802e6d4879e63233b54aff54e6788ea9ef568cec0259cc60fe286',
                    'wavefunc-dvmcp-bridge',
                )
            }
        }

        console.log(`[DVMCP] Requesting music recognition for: ${audioUrl} with provider: ${this.providerPubkey}`)

        // Create the DVMCP request event (2025-03-26 format)
        const requestEvent = new NDKEvent(this.ndk)
        console.log('[DVMCP] Request event:', requestEvent)
        requestEvent.kind = JOB_KIND
        requestEvent.content = JSON.stringify({
            method: 'tools/call',
            params: {
                name: 'music-recognition', // Updated tool name to match config
                arguments: {
                    audioUrl,
                },
            },
        })
        requestEvent.tags = [
            ['method', 'tools/call'], // Updated tag format
            ['p', this.providerPubkey],
            ['s', this.serverIdentifier],
        ]

        await requestEvent.sign()

        // Subscribe to responses and feedback
        const sub = this.ndk.subscribe({
            kinds: [RESULT_KIND as NDKKind, FEEDBACK_KIND as NDKKind],
            '#e': [requestEvent.id],
            limit: 5,
        })

        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                sub.stop()
                reject(new Error('DVMCP request timed out'))
            }, 60000) // Increased timeout to 60 seconds for payment flow

            sub.on('event', async (event: NDKEvent) => {
                try {
                    if (event.kind === FEEDBACK_KIND) {
                        // Handle feedback events (status updates)
                        const statusTag = event.tags.find((tag) => tag[0] === 'status')
                        if (statusTag) {
                            const status = statusTag[1]
                            const statusMessage = statusTag[2] // Optional error message
                            console.log(`[DVMCP] Status: ${status}${statusMessage ? ` - ${statusMessage}` : ''}`)

                            if (status === 'payment-required') {
                                console.log('[DVMCP] Payment required status received')
                                console.log('[DVMCP] Event tags:', event.tags)
                                const amountTag = event.tags.find((tag) => tag[0] === 'amount')
                                if (amountTag) {
                                    console.log('[DVMCP] Full amount tag:', amountTag)
                                    const amount = amountTag[1]
                                    const invoice = amountTag[2] // Lightning invoice (bolt11)

                                    // Check if invoice looks like a Lightning invoice (starts with 'lnbc', 'lntb', etc.)
                                    const isValidInvoice =
                                        invoice &&
                                        typeof invoice === 'string' &&
                                        (invoice.startsWith('lnbc') ||
                                            invoice.startsWith('lntb') ||
                                            invoice.startsWith('lnbcrt'))
                                    console.log(`[DVMCP] Is valid Lightning invoice:`, isValidInvoice)

                                    // Look for invoice in other tags if not found in amount tag
                                    if (!isValidInvoice) {
                                        console.log('[DVMCP] Looking for invoice in other tags...')
                                        const invoiceTag = event.tags.find(
                                            (tag) => tag[0] === 'bolt11' || tag[0] === 'invoice',
                                        )
                                        if (invoiceTag) {
                                            console.log('[DVMCP] Found invoice tag:', invoiceTag)
                                            const foundInvoice = invoiceTag[1]
                                            console.log('[DVMCP] Invoice from separate tag:', foundInvoice)
                                        } else {
                                            console.log('[DVMCP] No separate invoice tag found')
                                        }
                                    }

                                    // Use the correct invoice (from separate tag if needed)
                                    let finalInvoice = invoice
                                    if (!isValidInvoice) {
                                        const invoiceTag = event.tags.find(
                                            (tag) => tag[0] === 'bolt11' || tag[0] === 'invoice',
                                        )
                                        if (invoiceTag) {
                                            finalInvoice = invoiceTag[1]
                                            console.log('[DVMCP] Using invoice from separate tag:', finalInvoice)
                                        }
                                    }

                                    // Attempt to pay the invoice automatically
                                    const paymentSuccess = await this.handlePaymentRequest(amount, finalInvoice)

                                    if (!paymentSuccess) {
                                        clearTimeout(timeout)
                                        sub.stop()
                                        const error = new Error(
                                            `Payment required: ${amount} sats. Please pay the invoice and try again.`,
                                        )
                                        // Attach invoice to error object for UI to access
                                        ;(error as any).invoice = finalInvoice
                                        ;(error as any).amount = amount
                                        reject(error)
                                        return
                                    }

                                    // If payment successful, continue waiting for processing result
                                    console.log('[DVMCP] Payment completed, waiting for processing...')
                                } else {
                                    clearTimeout(timeout)
                                    sub.stop()
                                    reject(new Error('Payment required but no amount specified'))
                                }
                            } else if (status === 'error') {
                                clearTimeout(timeout)
                                sub.stop()
                                reject(new Error(statusMessage || event.content || 'DVMCP processing error'))
                            } else if (status === 'processing') {
                                console.log('[DVMCP] Job is being processed...')
                            } else if (status === 'success') {
                                console.log('[DVMCP] Job completed successfully, waiting for results...')
                            }
                        }
                    } else if (event.kind === RESULT_KIND) {
                        // Handle result events (2025-03-26 format)
                        const content = JSON.parse(event.content)

                        console.log('[DVMCP] Result event:', content)

                        // Check for protocol errors first
                        if (content.error) {
                            clearTimeout(timeout)
                            sub.stop()
                            reject(new Error(content.error.message || 'DVMCP protocol error'))
                            return
                        }

                        // Handle successful response
                        if (content.content && Array.isArray(content.content)) {
                            const toolResult = content.content[0]
                            if (toolResult?.text) {
                                const response: DVMCPResponse = JSON.parse(toolResult.text)

                                if (
                                    (response.type === 'audd_response' ||
                                        response.type === 'music_recognition_result') &&
                                    response.result
                                ) {
                                    clearTimeout(timeout)
                                    sub.stop()
                                    resolve(response.result)
                                } else if (
                                    response.type === 'audd_error' ||
                                    response.type === 'music_recognition_error'
                                ) {
                                    clearTimeout(timeout)
                                    sub.stop()
                                    reject(new Error(response.error || 'Music recognition failed'))
                                }
                            }
                        } else if (content.isError) {
                            // Handle execution errors
                            clearTimeout(timeout)
                            sub.stop()
                            const errorText = content.content?.[0]?.text || 'Unknown execution error'
                            reject(new Error(errorText))
                        }
                    }
                } catch (error) {
                    console.error('[DVMCP] Error processing event:', error)
                }
            })

            // Publish the request
            console.log('[DVMCP] NDK connected relays:', Array.from(this.ndk.pool.relays.keys()))
            console.log('[DVMCP] NDK explicit relay URLs:', this.ndk.explicitRelayUrls)

            try {
                const pubStatus = await requestEvent.publish()
                console.log('[DVMCP] Publish status:', pubStatus)
            } catch (publishError: any) {
                let errorMessage = 'Unknown publish error'
                if (publishError instanceof Error) {
                    errorMessage = publishError.message
                }
                console.error('[DVMCP] Error during NDK publish:', publishError)
                clearTimeout(timeout)
                sub.stop()
                reject(new Error(`Failed to publish DVMCP request: ${errorMessage}`))
                return
            }
        })
    }
}

// Create a singleton instance
let dvmcpService: DVMCPService | null = null

export function createDVMCPService(ndk: NDK): DVMCPService {
    if (!dvmcpService) {
        dvmcpService = new DVMCPService(ndk)
    }
    return dvmcpService
}

export function getDVMCPService(): DVMCPService | null {
    return dvmcpService
}

/**
 * Helper function to set up NWC payments for DVMCP
 */
export async function setupNWCPayments(
    dvmcpService: DVMCPService,
    ndk: NDK,
    connectionString?: string,
): Promise<boolean> {
    try {
        // Get connection string from parameter, environment, or localStorage
        const nwcConnectionString =
            connectionString ||
            process.env.NWC_CONNECTION_STRING ||
            (typeof localStorage !== 'undefined' ? localStorage.getItem('nwc_connection_string') : null)

        if (!nwcConnectionString) {
            console.log('[DVMCP] No NWC connection string available for automatic payments')
            return false
        }

        // Dynamically import NDKNWCWallet to avoid version conflicts
        try {
            console.log('[DVMCP] Setting up NWC wallet for automatic payments...')

            // Create NWC wallet instance
            const nwcWallet = new NDKNWCWallet(ndk as any, {
                pairingCode: nwcConnectionString,
                timeout: 30000,
            })

            // Set up event listeners
            nwcWallet.on('ready', () => {
                console.log('[DVMCP] NWC wallet is ready for payments')
            })

            nwcWallet.on('balance_updated', (balance: any) => {
                console.log('[DVMCP] NWC wallet balance updated:', balance?.amount || 0, 'sats')
            })

            // Create payment handler
            const paymentHandler: PaymentHandler = async (amount: string, invoice: string): Promise<boolean> => {
                try {
                    console.log(`[DVMCP] Paying ${amount} sats via NWC...`)

                    // Use the wallet's lnPay method if available, or pay method
                    const walletAny = nwcWallet as any
                    let paymentResult

                    if (walletAny.lnPay) {
                        // Use lnPay method
                        paymentResult = await walletAny.lnPay({ pr: invoice })
                    } else if (walletAny.pay) {
                        // Use pay method
                        paymentResult = await walletAny.pay({ invoice })
                    } else {
                        throw new Error('No payment method available on NWC wallet')
                    }

                    if (paymentResult) {
                        console.log('[DVMCP] NWC payment successful!')
                        return true
                    } else {
                        console.error('[DVMCP] NWC payment failed')
                        return false
                    }
                } catch (error) {
                    console.error('[DVMCP] NWC payment error:', error)
                    return false
                }
            }

            // Set the payment handler on the DVMCP service
            dvmcpService.setPaymentHandler(paymentHandler)

            // Store connection string for future use
            if (typeof localStorage !== 'undefined' && connectionString) {
                localStorage.setItem('nwc_connection_string', connectionString)
            }

            console.log('[DVMCP] NWC payments configured successfully')
            return true
        } catch (importError) {
            console.error('[DVMCP] Failed to import NDK wallet package:', importError)
            console.log('[DVMCP] NWC payments not available. Install @nostr-dev-kit/ndk-wallet for automatic payments.')
            return false
        }
    } catch (error) {
        console.error('[DVMCP] Failed to setup NWC payments:', error)
        return false
    }
}
