'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { nostrService } from '@/services/ndk'
import { NDKNip46Signer } from '@nostr-dev-kit/ndk'

interface BunkerConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect: (signer: NDKNip46Signer) => void
}

export function BunkerConnectDialog({ open, onOpenChange, onConnect }: BunkerConnectDialogProps) {
  const [bunkerUrl, setBunkerUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleConnect = async (url: string) => {
    setLoading(true)
    setError(null)

    try {
      const ndk = nostrService.getNDK()
      const nip46signer = new NDKNip46Signer(ndk, url)
      await nip46signer.blockUntilReady()
      onConnect(nip46signer)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      console.error('Connection error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to Bunker</DialogTitle>
          <DialogDescription>Scan a Bunker QR code or enter a bunker:// URL to connect.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Scanner
            onScan={(results) => results?.[0]?.rawValue && handleConnect(results[0].rawValue)}
            onError={(error) => console.log(error)}
          />
          <div className="flex gap-2">
            <Input value={bunkerUrl} onChange={(e) => setBunkerUrl(e.target.value)} placeholder="Enter bunker:// URL" />
            <Button onClick={() => handleConnect(bunkerUrl)} disabled={loading || !bunkerUrl}>
              Connect
            </Button>
          </div>
          {error && <div className="text-sm text-red-500">{error}</div>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
