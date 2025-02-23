"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus, Trash, X } from "lucide-react";
import { Station } from "@wavefunc/common";
import { Textarea } from "@/components/ui/textarea";

interface EditStationDrawerProps {
  station?: Station;
  isOpen: boolean;
  onClose: () => void;
  onSave: (station: Partial<Station>) => void;
}

const emptyStream = {
  url: "",
  format: "audio/mpeg",
  quality: {
    bitrate: 128000,
    codec: "mp3",
    sampleRate: 44100,
  },
  primary: true,
};

const emptyStation: Partial<Station> = {
  name: "",
  description: "",
  website: "",
  genre: "",
  imageUrl: "",
  streams: [emptyStream],
  tags: [],
};

export function EditStationDrawer({
  station,
  isOpen,
  onClose,
  onSave,
}: EditStationDrawerProps) {
  const [editedStation, setEditedStation] = React.useState<Partial<Station>>(
    station || emptyStation
  );

  useEffect(() => {
    if (station) {
      setEditedStation(station);
    } else {
      setEditedStation(emptyStation);
    }
  }, [station]);

  useEffect(() => {
    if (!isOpen) {
      setEditedStation(station || emptyStation);
    }
  }, [isOpen, station]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedStation);
  };

  const handleAddStream = () => {
    setEditedStation({
      ...editedStation,
      streams: [
        ...(editedStation.streams || []),
        { ...emptyStream, primary: false },
      ],
    });
  };

  const handleRemoveStream = (index: number) => {
    setEditedStation({
      ...editedStation,
      streams: editedStation.streams?.filter((_, i) => i !== index),
    });
  };

  const handleStreamChange = (index: number, field: string, value: any) => {
    setEditedStation({
      ...editedStation,
      streams: editedStation.streams?.map((stream, i) =>
        i === index ? { ...stream, [field]: value } : stream
      ),
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[90vw] sm:max-w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-primary text-lg font-press-start-2p">
            {station ? "Edit Station" : "Create Station"}
          </SheetTitle>
          <SheetDescription className="font-press-start-2p text-xs">
            {station ?
              "Make changes to your radio station here."
            : "Create a new radio station."}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name">Station Name</Label>
            <Input
              id="name"
              value={editedStation.name || ""}
              onChange={(e) =>
                setEditedStation({ ...editedStation, name: e.target.value })
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={editedStation.description || ""}
              onChange={(e) =>
                setEditedStation({
                  ...editedStation,
                  description: e.target.value,
                })
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={editedStation.website || ""}
              onChange={(e) =>
                setEditedStation({ ...editedStation, website: e.target.value })
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="genre">Genre</Label>
            <Input
              id="genre"
              value={editedStation.genre || ""}
              onChange={(e) =>
                setEditedStation({ ...editedStation, genre: e.target.value })
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="imageUrl">Thumbnail URL</Label>
            <Input
              id="imageUrl"
              type="url"
              value={editedStation.imageUrl || ""}
              onChange={(e) =>
                setEditedStation({ ...editedStation, imageUrl: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Streams</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddStream}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Stream
              </Button>
            </div>
            {editedStation.streams?.map((stream, index) => (
              <div key={index} className="space-y-2 p-4 border rounded-lg">
                <div className="flex justify-between">
                  <Label>Stream {index + 1}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveStream(index)}
                    disabled={editedStation.streams?.length === 1}
                  >
                    <Trash className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <Input
                  placeholder="Stream URL"
                  value={stream.url || ""}
                  onChange={(e) =>
                    handleStreamChange(index, "url", e.target.value)
                  }
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Format</Label>
                    <Input
                      value={stream.format || ""}
                      onChange={(e) =>
                        handleStreamChange(index, "format", e.target.value)
                      }
                      required
                    />
                  </div>
                  <div>
                    <Label>Primary</Label>
                    <input
                      type="checkbox"
                      checked={stream.primary}
                      onChange={(e) =>
                        handleStreamChange(index, "primary", e.target.checked)
                      }
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between space-x-2">
            <Button type="submit" className="bg-primary text-white">
              {station ? "Save Changes" : "Create Station"}
            </Button>
            <Button type="button" onClick={onClose} variant="destructive">
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
