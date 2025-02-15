'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { nostrService } from '@/services/ndk'
import { NDKEvent, NDKKind, NDKNip46Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { CopyIcon, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useState } from 'react'
import { NOSTR_CONNECT_KEY, NOSTR_LOCAL_SIGNER_KEY } from './NostrConnect'

interface NostrConnectQRDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (signer: NDKNip46Signer) => void
}

export function NostrConnectQRDialog({ open, onOpenChange, onDone }: NostrConnectQRDialogProps) {
  const [localSigner, setLocalSigner] = useState<NDKPrivateKeySigner | null>(null)
  const [localPubkey, setLocalPubkey] = useState<string | null>(null)
  const [tempSecret, setTempSecret] = useState<string | null>(null)

  const [listening, setListening] = useState(false)
  const [generatingConnectionUrl, setGeneratingConnectionUrl] = useState(false)

  // Initialize local signer once when dialog opens
  useEffect(() => {
    if (open && !localSigner) {
      setGeneratingConnectionUrl(true)
      const signer = NDKPrivateKeySigner.generate()
      setLocalSigner(signer)
      signer.user().then((user) => {
        setLocalPubkey(user.pubkey)
        setGeneratingConnectionUrl(false)
      })
    } else if (!open) {
      setLocalSigner(null)
      setLocalPubkey(null)
    }
  }, [open])

  const connectionUrl = useMemo(() => {
    if (!localPubkey) return null
    const localMachineIp = process.env.NEXT_PUBLIC_LOCAL_MACHINE_IP
    const relay = `ws://${localMachineIp}:3002`
    const host = location.protocol + '//' + localMachineIp
    const secret = Math.random().toString(36).substring(2, 15)

    setTempSecret(secret)

    const params = new URLSearchParams()
    params.set('relay', relay)
    params.set('name', 'GMsirs')
    params.set('url', host)
    // params.set('image', new URL('/apple-touch-icon.png', host).toString())
    params.set('secret', secret)
    // params.set('perms', 'sign_event,get_public_key,get_relays')

    return `nostrconnect://${localPubkey}?` + params.toString()
  }, [localPubkey])

  const constructBunkerUrl = (event: NDKEvent) => {
    const pTag = event.tags.find((tag) => tag[0] === 'p')
    if (!pTag?.[1]) throw new Error('No pubkey in p tag')

    const baseUrl = `bunker://${event.pubkey}?`
    const localMachineIp = process.env.NEXT_PUBLIC_LOCAL_MACHINE_IP
    const relay = `ws://${localMachineIp}:3002`

    const params = new URLSearchParams()
    params.set('relay', relay)
    params.set('secret', tempSecret ?? '')

    return baseUrl + params.toString()
  }

  useEffect(() => {
    setListening(true)
    const ndk = nostrService.getNDK()
    const ackSub = ndk.subscribe({
      kinds: [NDKKind.NostrConnect],
      '#p': [localPubkey ?? ''],
      since: Math.floor(Date.now() / 1000),
      limit: 1,
    })

    ackSub.on('event', async (event) => {
      if (!localSigner) return
      await event.decrypt(undefined, localSigner)
      const response = JSON.parse(event.content)

      console.log('event author', event.pubkey)

      if (response.result && response.result === tempSecret) {
        const bunkerUrl = constructBunkerUrl(event)
        const nip46Signer = new NDKNip46Signer(ndk, bunkerUrl, localSigner)
        await nip46Signer.blockUntilReady()
        setListening(false)

        localStorage.setItem(NOSTR_LOCAL_SIGNER_KEY, localSigner.privateKey ?? '')
        localStorage.setItem(NOSTR_CONNECT_KEY, bunkerUrl)

        onDone(nip46Signer)
        onOpenChange(false)
      } else if (response.method && response.method === 'connect') {
        console.log('Connect method in response')
        return
      }
    })

    return () => {
      ackSub.stop()
    }
  }, [connectionUrl])

  const copyToClipboard = (text: string) => {
    // Try the modern Clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch((err) => {
        console.warn('Clipboard API failed, falling back to textarea method:', err)
        // Fall back to textarea method
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        try {
          document.execCommand('copy')
        } catch (err) {
          console.error('Failed to copy text:', err)
        }
        document.body.removeChild(textarea)
      })
    } else {
      // Use textarea method directly if Clipboard API is not available
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
      } catch (err) {
        console.error('Failed to copy text:', err)
      }
      document.body.removeChild(textarea)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan with NIP-46 App</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {generatingConnectionUrl ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm text-muted-foreground">Generating connection...</p>
            </div>
          ) : connectionUrl ? (
            <>
              <a
                href={connectionUrl}
                className="block hover:opacity-90 transition-opacity"
                target="_blank"
                rel="noopener noreferrer"
              >
                <QRCodeSVG value={connectionUrl} size={400} />
              </a>
              <div className="flex items-center gap-2">
                <Input value={connectionUrl} readOnly onClick={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(connectionUrl)}>
                  <CopyIcon className="h-4 w-4" />
                </Button>
                {listening && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm text-muted-foreground">Waiting for connection...</p>
            </div>
          )}
          {/* {error && <div className="text-sm text-red-500">{error}</div>} */}
        </div>
      </DialogContent>
    </Dialog>
  )
}
