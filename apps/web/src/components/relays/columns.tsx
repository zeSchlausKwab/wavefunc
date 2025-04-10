"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Define the relay data type
export type Relay = {
  url: string
  read: boolean
  write: boolean
}

export const columns: ColumnDef<Relay>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
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
    accessorKey: "url",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Relay URL
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const url = row.getValue("url") as string
      return <div className="font-medium">{url}</div>
    },
  },
  {
    accessorKey: "read",
    header: "Read",
    cell: ({ row }) => {
      const isChecked = row.getValue("read") as boolean
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
    accessorKey: "write",
    header: "Write",
    cell: ({ row }) => {
      const isChecked = row.getValue("write") as boolean
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
    id: "actions",
    cell: ({ row }) => {
      const relay = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => {
                // Delete logic will be handled by the data-table component
                console.log("Delete relay:", relay.url)
              }}
            >
              Delete Relay
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
] 