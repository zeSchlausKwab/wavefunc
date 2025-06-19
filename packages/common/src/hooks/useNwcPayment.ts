import { ndkStore, walletStore } from '@wavefunc/common'
import type { NWCWalletData } from '@wavefunc/common'
import { NDKNWCWallet } from '@nostr-dev-kit/ndk-wallet'
import { useStore } from '@tanstack/react-store'
import { useState } from 'react'
import { toast } from 'sonner'

export type PaymentStatus = 'idle' | 'processing' | 'success' | 'error' | 'required'

export function useNwcPayment() {
    const { ndk } = useStore(ndkStore)
    const walletState = useStore(walletStore)
    const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle')
    const [paymentAmount, setPaymentAmount] = useState<string>('')
    const [paymentInvoice, setPaymentInvoice] = useState<string>('')

    const isNwcConfigured = walletState.isConnected && walletState.walletData?.type === 'nwc'

    const processNwcPayment = async (invoice: string, amount: string) => {
        console.log('processNwcPayment called with:', { invoice, amount })
        console.log('Current state values:', { paymentInvoice, paymentAmount })

        const toastId = `nwc-payment-${Date.now()}`
        try {
            setPaymentStatus('processing')

            toast.loading('Processing NWC Payment...', {
                description: 'Connecting to your wallet...',
                id: toastId,
            })

            if (!isNwcConfigured || walletState.walletData?.type !== 'nwc') {
                throw new Error('NWC wallet connection details not found.')
            }
            if (!ndk) throw new Error('NDK not available')

            const walletData = walletState.walletData as NWCWalletData

            console.log('walletData', walletData)

            const nwcWallet = new NDKNWCWallet(ndk, {
                pairingCode: walletData.pairingCode,
            })

            console.log('ndk', ndk)

            // await new Promise<void>((resolve, reject) => {
            //     const timeout = setTimeout(() => reject(new Error('NWC wallet connection timed out')), 15000)

            //     nwcWallet.on('ready', () => {
            //         clearTimeout(timeout)
            //         resolve()
            //     })
            // })

            toast.loading('Approving payment in wallet...', {
                description: `Sending ${amount} sats`,
                id: toastId,
            })

            console.log('invoice', invoice)

            const paymentResult = await nwcWallet.lnPay({ pr: invoice })

            console.log('paymentResult', paymentResult)

            if (paymentResult?.preimage) {
                console.log('Payment successful! Preimage:', paymentResult.preimage)
                toast.dismiss(toastId)
                setPaymentStatus('success')
                toast.success('Payment Successful!', {
                    description: 'Payment confirmed. Recognition process will continue.',
                })
                return true // Indicate success
            } else {
                console.error('Payment failed: No preimage received. Result:', paymentResult)
                throw new Error('Payment failed: No preimage received from wallet.')
            }
        } catch (error) {
            console.error('NWC payment failed:', error)
            toast.dismiss(toastId)
            setPaymentStatus('error')
            toast.error('NWC Payment Failed', {
                description: error instanceof Error ? error.message : 'Please try copying the invoice manually.',
            })
            return false // Indicate failure
        }
    }

    const requestPayment = (amount: string, invoice: string) => {
        console.log('requestPayment called with:', { amount, invoice })
        setPaymentStatus('required')
        setPaymentAmount(amount)
        setPaymentInvoice(invoice)
        console.log('After setting state - paymentAmount:', amount, 'paymentInvoice:', invoice)
    }

    return {
        paymentStatus,
        setPaymentStatus,
        paymentAmount,
        paymentInvoice,
        isNwcConfigured,
        processNwcPayment,
        requestPayment,
    }
}
