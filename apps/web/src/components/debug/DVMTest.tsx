import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { nostrService } from '@/lib/services/ndk'
import { type DVMResponse } from '@wavefunc/common'
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import { useState } from 'react'

const JOB_KIND = 5000
const RESULT_KIND = 6000

export function DVMTest() {
    const [input, setInput] = useState('')
    const [uppercase, setUppercase] = useState(false)
    const [reverse, setReverse] = useState(false)
    const [response, setResponse] = useState<DVMResponse | null>(null)
    const [loading, setLoading] = useState(false)

    const resetForm = () => {
        setInput('')
        setUppercase(false)
        setReverse(false)
    }

    const handleSubmit = async () => {
        setLoading(true)
        setResponse(null)

        try {
            const requestEvent = new NDKEvent(nostrService.getNDK())
            requestEvent.kind = JOB_KIND
            requestEvent.content = JSON.stringify({
                type: 'text-process',
                input,
                options: {
                    uppercase,
                    reverse,
                },
            })

            await requestEvent.sign()

            const sub = nostrService.getNDK().subscribe({
                kinds: [RESULT_KIND as NDKKind],
                '#e': [requestEvent.id],
                limit: 1,
            })

            sub.on('event', (event: NDKEvent) => {
                const content = JSON.parse(event.content)
                setResponse(content)
                setLoading(false)
                resetForm()
                sub.stop()
            })

            await requestEvent.publish()

            setTimeout(() => {
                if (loading) {
                    setLoading(false)
                    sub.stop()
                }
            }, 1000)
        } catch (error) {
            console.error('Error sending request:', error)
            setLoading(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Test DVM</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>Input Text</Label>
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Enter text to process..."
                    />
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="uppercase"
                            checked={uppercase}
                            onCheckedChange={(checked) => setUppercase(checked as boolean)}
                        />
                        <Label htmlFor="uppercase">Uppercase</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="reverse"
                            checked={reverse}
                            onCheckedChange={(checked) => setReverse(checked as boolean)}
                        />
                        <Label htmlFor="reverse">Reverse</Label>
                    </div>
                </div>

                <Button onClick={handleSubmit} disabled={loading || !input}>
                    {loading ? 'Processing...' : 'Send Request'}
                </Button>

                {response && (
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                        <div>
                            <strong>Input:</strong> {response.input}
                        </div>
                        <div>
                            <strong>Output:</strong> {response.output}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Processed at: {new Date(response.processedAt).toLocaleString()}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
