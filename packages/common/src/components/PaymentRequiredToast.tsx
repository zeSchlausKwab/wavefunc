import { Button } from '@wavefunc/ui/components/ui/button'
import { AlertTriangle, Zap } from 'lucide-react'

interface PaymentRequiredToastProps {
    amount: string
    invoice: string
    isNwcConfigured: boolean
    onNwcPayment: () => void
    onCopyInvoice: () => void
}

export function PaymentRequiredToast({
    amount,
    invoice,
    isNwcConfigured,
    onNwcPayment,
    onCopyInvoice,
}: PaymentRequiredToastProps) {
    return (
        <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 space-y-3">
            <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                    <p className="font-medium text-sm text-amber-800">Payment Required</p>
                    <p className="text-xs text-amber-700">{amount} sats needed for music recognition</p>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                {isNwcConfigured && (
                    <Button
                        onClick={onNwcPayment}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        size="sm"
                    >
                        <Zap className="h-4 w-4 mr-2" />
                        Pay with Wallet ({amount} sats)
                    </Button>
                )}

                {invoice && invoice.includes('ln') && (
                    <Button onClick={onCopyInvoice} variant="outline" className="w-full" size="sm">
                        Copy Lightning Invoice
                    </Button>
                )}

                {!isNwcConfigured && (!invoice || !invoice.includes('ln')) && (
                    <div className="text-xs text-amber-700 text-center py-2">
                        No payment method available. Please contact support.
                    </div>
                )}
            </div>
        </div>
    )
}
