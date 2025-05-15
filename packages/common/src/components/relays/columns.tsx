'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Checkbox } from '@wavefunc/ui/components/ui/checkbox'
import { ChevronsUpDown, Trash2 } from 'lucide-react'

// Define the relay data type
export type Relay = {
    url: string
    read: boolean
    write: boolean
}

export const createColumns = (onDelete?: (url: string) => void): ColumnDef<Relay>[] => [
    {
        id: 'select',
        header: ({ table }) => (
            <Checkbox
                checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label="Select all"
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label="Select row"
            />
        ),
        enableSorting: false,
        enableHiding: false,
    },
    {
        accessorKey: 'url',
        header: ({ column }) => {
            return (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    Relay URL
                    <ChevronsUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
        cell: ({ row }) => {
            const url = row.getValue('url') as string
            return <div className="font-medium">{url}</div>
        },
    },
    {
        accessorKey: 'read',
        header: 'Read',
        cell: ({ row }) => {
            const isChecked = row.getValue('read') as boolean
            return (
                <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                        row.original.read = checked as boolean
                    }}
                    aria-label="Read permission"
                />
            )
        },
    },
    {
        accessorKey: 'write',
        header: 'Write',
        cell: ({ row }) => {
            const isChecked = row.getValue('write') as boolean
            return (
                <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                        row.original.write = checked as boolean
                    }}
                    aria-label="Write permission"
                />
            )
        },
    },
    {
        id: 'actions',
        cell: ({ row }) => {
            const relay = row.original

            return (
                <Button
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                        if (onDelete) {
                            onDelete(relay.url)
                        }
                    }}
                >
                    <span className="sr-only">Delete relay</span>
                    <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
            )
        },
    },
]

// For backward compatibility
export const columns = createColumns()
