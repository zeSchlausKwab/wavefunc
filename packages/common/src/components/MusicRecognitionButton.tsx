import { useStore } from '@tanstack/react-store'
import { stationsStore, walletStore } from '@wavefunc/common'
import { PaymentRequiredToast } from '@wavefunc/common/src/components/PaymentRequiredToast'
import { RecognitionResultDialog } from '@wavefunc/common/src/components/RecognitionResultDialog'
import { useAudioRecorder, useMusicRecognition, useNwcPayment } from '@wavefunc/common/src/hooks'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Progress } from '@wavefunc/ui/components/ui/progress'
import { Music2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const RECORDING_DURATION = 5 // seconds

function ProgressToast({ progress, timeRemaining }: { progress: number; timeRemaining: number }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span>Capturing audio...</span>
                <span>{timeRemaining}s</span>
            </div>
            <Progress value={progress} className="w-full" />
        </div>
    )
}

export function MusicRecognitionButton() {
    const currentStation = useStore(stationsStore, (state) => state.currentStation)
    const { isNwcConfigured } = useNwcPayment()
    const {
        isLoading,
        result,
        setResult,
        paymentStatus,
        recognizeSong,
        processNwcPayment,
        paymentAmount,
        paymentInvoice,
    } = useMusicRecognition()
    const { isRecording, startRecording } = useAudioRecorder(recognizeSong)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [nwcConfigured, setNwcConfigured] = useState(false)
    const progressToastIdRef = useRef<string | number | null>(null)
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const paymentToastIdRef = useRef<string | number | null>(null)

    const walletState = useStore(walletStore)

    useEffect(() => {
        const isNwcConnected = walletState.isConnected && walletState.walletData?.type === 'nwc'
        setNwcConfigured(isNwcConnected)

        if (isNwcConnected) {
            console.log('NWC wallet connected and ready for payments')
        }
    }, [walletState.isConnected, walletState.walletData])

    useEffect(() => {
        if (result) {
            console.log('result', result)
            setIsDialogOpen(true)
        }
    }, [result])

    useEffect(() => {
        if (paymentStatus === 'required' && paymentAmount && paymentInvoice) {
            console.log('Auto-payment conditions met, triggering NWC payment...')
            const handleNwcPay = async () => {
                console.log('handleNwcPay called with:', {
                    paymentInvoice: paymentInvoice?.substring(0, 20) + '...',
                    paymentAmount,
                })
                const success = await processNwcPayment(paymentInvoice, paymentAmount)
                if (success) {
                    // Automatically retry recognition after successful payment
                    // This requires the audio blob to be stored temporarily
                    // For now, user has to click again.
                    toast.info('Payment successful. Please click recognize again.')
                }
            }

            if (paymentToastIdRef.current) toast.dismiss(paymentToastIdRef.current)
            paymentToastIdRef.current = toast(
                <PaymentRequiredToast
                    amount={paymentAmount}
                    invoice={paymentInvoice}
                    isNwcConfigured={isNwcConfigured}
                    onNwcPayment={handleNwcPay}
                    onCopyInvoice={() => {
                        navigator.clipboard.writeText(paymentInvoice)
                        toast.success('Invoice Copied!')
                    }}
                />,
                { duration: Infinity },
            )

            // Auto-trigger payment for NWC if configured
            if (isNwcConfigured) {
                console.log('Auto-triggering NWC payment since wallet is configured...')
                handleNwcPay()
            }
        } else if (paymentStatus !== 'required') {
            if (paymentToastIdRef.current) {
                toast.dismiss(paymentToastIdRef.current)
                paymentToastIdRef.current = null
            }
        }
    }, [paymentStatus, paymentAmount, paymentInvoice, isNwcConfigured, processNwcPayment])

    const showProgressToast = () => {
        let progress = 0
        let timeRemaining = RECORDING_DURATION

        progressToastIdRef.current = toast(<ProgressToast progress={progress} timeRemaining={timeRemaining} />, {
            duration: Infinity,
        })

        progressIntervalRef.current = setInterval(() => {
            progress += 100 / RECORDING_DURATION
            timeRemaining -= 1

            if (progressToastIdRef.current) {
                toast(<ProgressToast progress={progress} timeRemaining={Math.max(0, timeRemaining)} />, {
                    id: progressToastIdRef.current,
                    duration: Infinity,
                })
            }

            if (progress >= 100 && progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
                progressIntervalRef.current = null
            }
        }, 1000)
    }

    const hideProgressToast = () => {
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
            progressIntervalRef.current = null
        }
        if (progressToastIdRef.current) {
            toast.dismiss(progressToastIdRef.current)
            progressToastIdRef.current = null
        }
    }

    const hidePaymentToast = () => {
        if (paymentToastIdRef.current) {
            toast.dismiss(paymentToastIdRef.current)
            paymentToastIdRef.current = null
        }
    }

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            hideProgressToast()
            hidePaymentToast()
        }
    }, [])

    const handleClick = () => {
        if (isLoading || isRecording || !currentStation) return

        const primaryStream = currentStation.streams.find((s: any) => s.primary) || currentStation.streams[0]
        if (!primaryStream) {
            toast.error('No stream available for this station.')
            return
        }
        showProgressToast()
        startRecording(primaryStream.url)
    }

    const getButtonVariant = () => {
        if (paymentStatus === 'success') return 'default'
        if (paymentStatus === 'error') return 'destructive'
        if (paymentStatus === 'processing' || paymentStatus === 'required') return 'secondary'
        return 'outline'
    }

    const getButtonTitle = () => {
        const baseTitle = 'Recognize playing song'
        const nwcSuffix = isNwcConfigured ? ' (Auto-pay enabled)' : ''

        switch (paymentStatus) {
            case 'required':
                return `Payment required: ${paymentAmount} sats${nwcSuffix}`
            case 'processing':
                return `Processing payment...`
            case 'success':
                return 'Payment successful, processing...'
            case 'error':
                return 'Payment failed, try again'
            default:
                if (isRecording) return 'Capturing audio...'
                if (isLoading) return 'Recognizing...'
                return baseTitle + nwcSuffix
        }
    }

    return (
        <>
            <Button
                variant={getButtonVariant()}
                size="icon"
                onClick={handleClick}
                disabled={isLoading || isRecording || !currentStation}
                className="relative"
                title={getButtonTitle()}
            >
                <Music2 className="h-4 w-4" />
                {(isLoading || isRecording) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                )}
                {isNwcConfigured && paymentStatus === 'idle' && (
                    <div className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full" />
                )}
                {paymentStatus === 'required' && (
                    <div className="absolute -top-1 -right-1 h-2 w-2 bg-amber-500 rounded-full animate-pulse" />
                )}
                {paymentStatus === 'processing' && (
                    <div className="absolute -top-1 -right-1 h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                )}
                {paymentStatus === 'success' && (
                    <div className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full" />
                )}
                {paymentStatus === 'error' && (
                    <div className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                )}
            </Button>

            <RecognitionResultDialog
                result={result}
                isOpen={isDialogOpen}
                onOpenChange={(open: boolean) => {
                    if (!open) setResult(null)
                    setIsDialogOpen(open)
                }}
            />
        </>
    )
}
