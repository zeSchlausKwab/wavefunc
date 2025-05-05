import { NDKKind } from '@nostr-dev-kit/ndk'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
    cn,
    mapNostrEventToStation,
    ndkActions,
    RADIO_EVENT_KINDS,
    searchRadioStations,
    type NDKFilter,
    type Station,
} from '@wavefunc/common'
import StationGrid from '@wavefunc/common/src/components/station/StationGrid'
import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@wavefunc/ui/components/ui/dialog'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wavefunc/ui/components/ui/select'
import { Filter, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useMedia } from 'react-use'

export const Route = createFileRoute('/')({
    component: Index,
})

function Index() {
    const isMobile = useMedia('(max-width: 640px)')

    return (
        <div className="w-full flex flex-col gap-4 my-6 max-w-full">
            <h1 className={cn('font-bold mb-3', isMobile ? 'text-xl' : 'text-2xl md:text-3xl')}>Featured Stations</h1>
        </div>
    )
}
