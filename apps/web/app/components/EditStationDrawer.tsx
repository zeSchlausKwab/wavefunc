"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { X } from "lucide-react"

interface Station {
  id: number
  name: string
  genre: string
  url: string
  imageUrl: string
  isUserOwned: boolean
}

interface EditStationDrawerProps {
  station: Station
  isOpen: boolean
  onClose: () => void
  onUpdate: (updatedStation: Station) => void
}

export function EditStationDrawer({ station, isOpen, onClose, onUpdate }: EditStationDrawerProps) {
  const [editedStation, setEditedStation] = React.useState(station)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onUpdate(editedStation)
    onClose()
  }

  const handleCancel = () => {
    setEditedStation(station)
    onClose()
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[90vw] sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle className="text-primary text-lg font-press-start-2p">Edit Station</SheetTitle>
          <SheetDescription className="font-press-start-2p text-xs">
            Make changes to your radio station here. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs font-press-start-2p">
              Station Name
            </Label>
            <Input
              id="name"
              value={editedStation.name}
              onChange={(e) => setEditedStation({ ...editedStation, name: e.target.value })}
              required
              className="font-press-start-2p text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="genre" className="text-xs font-press-start-2p">
              Genre
            </Label>
            <Input
              id="genre"
              value={editedStation.genre}
              onChange={(e) => setEditedStation({ ...editedStation, genre: e.target.value })}
              required
              className="font-press-start-2p text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url" className="text-xs font-press-start-2p">
              Stream URL
            </Label>
            <Input
              id="url"
              type="url"
              value={editedStation.url}
              onChange={(e) => setEditedStation({ ...editedStation, url: e.target.value })}
              required
              className="font-press-start-2p text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="imageUrl" className="text-xs font-press-start-2p">
              Image URL
            </Label>
            <Input
              id="imageUrl"
              type="url"
              value={editedStation.imageUrl}
              onChange={(e) => setEditedStation({ ...editedStation, imageUrl: e.target.value })}
              required
              className="font-press-start-2p text-xs"
            />
          </div>
          <div className="flex justify-between space-x-2">
            <Button
              type="submit"
              className="bg-primary hover:bg-primary-foreground text-white font-press-start-2p text-xs"
            >
              Save Changes
            </Button>
            <Button
              type="button"
              onClick={handleCancel}
              className="bg-destructive hover:bg-destructive/90 text-white font-press-start-2p text-xs"
            >
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

