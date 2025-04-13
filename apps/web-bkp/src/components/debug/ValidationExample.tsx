import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle } from 'lucide-react'
import { isValidEmail, formatPhoneNumber } from '@wavefunc/common/validation'

export function ValidationExample() {
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [validationResult, setValidationResult] = useState<{
        isValidEmail: boolean
        formattedPhone: string
    } | null>(null)

    const handleValidate = async () => {
        const localValidation = {
            isValidEmail: isValidEmail(email),
            formattedPhone: formatPhoneNumber(phone),
        }

        const response = await fetch(
            `http://${import.meta.env.VITE_PUBLIC_HOST}:${import.meta.env.VITE_PUBLIC_API_PORT}/api/validate`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, phone }),
            },
        )

        const serverValidation = await response.json()

        setValidationResult({
            isValidEmail: localValidation.isValidEmail && serverValidation.isValidEmail,
            formattedPhone: serverValidation.formattedPhone,
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Validation Example</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter email"
                    />
                </div>

                <div className="space-y-2">
                    <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Enter phone"
                    />
                </div>

                <Button onClick={handleValidate}>Validate</Button>

                {validationResult && (
                    <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2">
                            {validationResult.isValidEmail ? (
                                <CheckCircle className="text-green-500" />
                            ) : (
                                <XCircle className="text-red-500" />
                            )}
                            <span>Email is {validationResult.isValidEmail ? 'valid' : 'invalid'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <CheckCircle className="text-green-500" />
                            <span>Formatted phone: {validationResult.formattedPhone}</span>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
