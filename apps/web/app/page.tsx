'use client'

import { FollowingList } from './components/FollowingList'
import { DVMTest } from './components/DVMTest'
import { RelayDebugger } from './components/RelayDebugger'
import { NostrConnect } from './components/NostrConnect'
import { ValidationExample } from './components/ValidationExample'

export default function Home() {
  const testPubkey = '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245'

  return (
    <main className="container mx-auto p-4 space-y-8">
      <NostrConnect />
      <DVMTest />
      <RelayDebugger />
      <FollowingList pubkey={testPubkey} />
      <ValidationExample />
    </main>
  )
}
