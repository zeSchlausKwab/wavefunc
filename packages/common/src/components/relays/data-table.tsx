'use client'

import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    getPaginationRowModel,
    getSortedRowModel,
    getFilteredRowModel,
} from '@tanstack/react-table'
import type {
    ColumnDef,
    SortingState,
    ColumnFiltersState,
    RowSelectionState,
    VisibilityState,
} from '@tanstack/react-table'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wavefunc/ui/components/ui/table'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Input } from '@wavefunc/ui/components/ui/input'
import { useState } from 'react'
import { Plus, Rocket } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { ndkActions } from '@wavefunc/common'
import { toast } from 'sonner'
import { DEFAULT_RELAYS } from '@wavefunc/common'
import { createColumns } from './columns'

interface DataTableProps<TData> {
    data: TData[]
    onRowsChange: (rows: TData[]) => void
}

export function RelayDataTable<TData>({ data, onRowsChange }: DataTableProps<TData>) {
    const [sorting, setSorting] = useState<SortingState>([])
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
    const [newRelayUrl, setNewRelayUrl] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const deleteRelay = (url: string) => {
        console.log('Deleting relay:', url)
        const success = ndkActions.removeRelay(url)
        console.log('Delete successful:', success)

        if (success) {
            const updatedRelays = ndkActions.getRelays() as unknown as TData[]
            console.log('Updated relays:', updatedRelays)
            onRowsChange(updatedRelays)
            toast('Relay removed', {
                description: 'The relay has been removed from your list',
            })
        } else {
            toast('Error', {
                description: 'Failed to remove relay',
                style: {
                    background: 'red',
                },
            })
        }
    }

    // Use the createColumns function and pass the deleteRelay callback
    const tableColumns = createColumns(deleteRelay) as ColumnDef<TData>[]

    const table = useReactTable({
        data,
        columns: tableColumns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        onColumnFiltersChange: setColumnFilters,
        getFilteredRowModel: getFilteredRowModel(),
        onRowSelectionChange: setRowSelection,
        onColumnVisibilityChange: setColumnVisibility,
        state: {
            sorting,
            columnFilters,
            rowSelection,
            columnVisibility,
        },
    })

    const addRelay = () => {
        if (!newRelayUrl) return

        try {
            // Simple URL validation
            new URL(newRelayUrl)

            if (data.some((relay: any) => relay.url === newRelayUrl)) {
                toast('Relay already exists', {
                    description: 'This relay is already in your list',
                    style: {
                        background: 'red',
                    },
                })
                return
            }

            // Use our direct relay function
            const success = ndkActions.addRelay(newRelayUrl)

            if (success) {
                // Get the updated relay list
                const updatedRelays = ndkActions.getRelays() as unknown as TData[]
                onRowsChange(updatedRelays)
                setNewRelayUrl('')

                toast('Relay added', {
                    description: 'New relay has been added to your list',
                })
            } else {
                throw new Error('Failed to add relay')
            }
        } catch (error) {
            toast('Invalid URL', {
                description: 'Please enter a valid relay URL (e.g., wss://relay.example.com)',
                style: {
                    background: 'red',
                },
            })
        }
    }

    const deleteSelectedRelays = () => {
        const selectedRows = table.getFilteredSelectedRowModel().rows
        if (selectedRows.length === 0) return

        // Get the selected relay URLs
        const selectedRelayUrls = selectedRows.map((row) => (row.original as any).url)

        // Remove each relay
        let successCount = 0
        selectedRelayUrls.forEach((url) => {
            const success = ndkActions.removeRelay(url)
            if (success) successCount++
        })

        // Update the data
        if (successCount > 0) {
            const updatedRelays = ndkActions.getRelays() as unknown as TData[]
            onRowsChange(updatedRelays)
            setRowSelection({})

            toast('Relays removed', {
                description: `${successCount} relay(s) have been removed from your list`,
            })
        }
    }

    const useDefaultRelays = async () => {
        setIsSubmitting(true)
        try {
            const success = await ndkActions.addDefaultRelays()

            if (success) {
                // Update the data with the new relays
                const updatedRelays = ndkActions.getRelays() as unknown as TData[]
                onRowsChange(updatedRelays)

                toast('Default relays added', {
                    description: `Added ${DEFAULT_RELAYS.length} default relays to your list`,
                })
            }
        } catch (error) {
            console.error('Failed to add default relays:', error)
            toast('Error', {
                description: 'Failed to add default relays',
                style: {
                    background: 'red',
                },
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const saveRelays = async () => {
        setIsSubmitting(true)
        try {
            // Use our updateRelays function from ndkActions
            const success = await ndkActions.updateRelays(data as any[])

            if (success) {
                toast('Relays Updated', {
                    description: 'Your relay settings have been updated successfully',
                })
            } else {
                throw new Error('Failed to update relays')
            }
        } catch (error) {
            console.error('Failed to update relays:', error)
            toast('Error', {
                description: 'Failed to update relay settings',
                style: {
                    background: 'red',
                },
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Relay Settings</CardTitle>
                <CardDescription>Configure which Nostr relays you connect to</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="wss://relay.example.com"
                        value={newRelayUrl}
                        onChange={(e) => setNewRelayUrl(e.target.value)}
                        className="max-w-sm"
                    />
                    <Button onClick={addRelay}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Relay
                    </Button>
                    <Button variant="outline" onClick={useDefaultRelays} disabled={isSubmitting} className="ml-2">
                        <Rocket className="mr-2 h-4 w-4" />
                        Add Default Relays
                    </Button>
                    {Object.keys(rowSelection).length > 0 && (
                        <Button variant="destructive" onClick={deleteSelectedRelays} className="ml-auto">
                            Delete Selected
                        </Button>
                    )}
                </div>

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => {
                                        return (
                                            <TableHead key={header.id}>
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(header.column.columnDef.header, header.getContext())}
                                            </TableHead>
                                        )
                                    })}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={tableColumns.length} className="h-24 text-center">
                                        No relays found. Add your first relay above.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length}{' '}
                        relay(s) selected.
                    </div>
                </div>

                {data.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-8 space-y-4">
                        <p className="text-muted-foreground">No relays configured.</p>
                        <Button onClick={useDefaultRelays} disabled={isSubmitting}>
                            <Rocket className="mr-2 h-4 w-4" />
                            Use Default Relays
                        </Button>
                    </div>
                )}
            </CardContent>

            <CardFooter className="flex justify-end">
                <Button onClick={saveRelays} disabled={isSubmitting || data.length === 0} className="px-6">
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
            </CardFooter>
        </Card>
    )
}
