"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  StationSchema,
  StationFormData,
} from "@wavefunc/common/src/schemas/station";
import { createRadioEvent } from "@wavefunc/common/src/nostr/radio";
import { nostrService } from "@/services/ndk";
import { NDKEvent } from "@nostr-dev-kit/ndk";

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

export function EditStationDrawer({
  station,
  isOpen,
  onClose,
  onSave,
}: EditStationDrawerProps) {
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StationFormData>({
    resolver: zodResolver(StationSchema),
    defaultValues: station || {
      name: "",
      description: "",
      website: "",
      genre: "",
      imageUrl: "",
      streams: [emptyStream],
      tags: [],
    },
  });

  React.useEffect(() => {
    if (station) {
      reset(station);
    }
  }, [station, reset]);

  const streams = watch("streams");

  const onSubmit = async (data: StationFormData) => {
    try {
      // Create tags array
      const tags = [
        ["genre", data.genre],
        ["thumbnail", data.imageUrl],
        ["client", "nostr_radio"],
      ];

      const event = createRadioEvent(
        {
          name: data.name,
          description: data.description,
          website: data.website,
          streams: data.streams,
        },
        tags
      );

      const ndk = nostrService.getNDK();
      const ndkEvent = new NDKEvent(ndk, event);

      if (ndkEvent) {
        await ndkEvent.publish();
        onSave(data);
        onClose();
      }
    } catch (error) {
      console.error("Error creating station:", error);
    }
  };

  const handleAddStream = () => {
    setValue("streams", [...streams, { ...emptyStream, primary: false }]);
  };

  const handleRemoveStream = (index: number) => {
    setValue(
      "streams",
      streams.filter((_, i) => i !== index)
    );
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name">Station Name</Label>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <Input {...field} error={errors.name?.message} />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={watch("description") || ""}
              onChange={(e) => setValue("description", e.target.value)}
              error={errors.description?.message}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={watch("website") || ""}
              onChange={(e) => setValue("website", e.target.value)}
              error={errors.website?.message}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="genre">Genre</Label>
            <Input
              id="genre"
              value={watch("genre") || ""}
              onChange={(e) => setValue("genre", e.target.value)}
              error={errors.genre?.message}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="imageUrl">Thumbnail URL</Label>
            <Input
              id="imageUrl"
              type="url"
              value={watch("imageUrl") || ""}
              onChange={(e) => setValue("imageUrl", e.target.value)}
              error={errors.imageUrl?.message}
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
            {streams.map((stream, index) => (
              <div key={index} className="space-y-2 p-4 border rounded-lg">
                <div className="flex justify-between">
                  <Label>Stream {index + 1}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveStream(index)}
                    disabled={streams.length === 1}
                  >
                    <Trash className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <Controller
                  name={`streams.${index}.url`}
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      placeholder="Stream URL"
                      error={errors.streams?.[index]?.url?.message}
                    />
                  )}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Format</Label>
                    <Input
                      value={stream.format || ""}
                      onChange={(e) =>
                        setValue(`streams.${index}.format`, e.target.value)
                      }
                      error={errors.streams?.[index]?.format?.message}
                    />
                  </div>
                  <div>
                    <Label>Primary</Label>
                    <input
                      type="checkbox"
                      checked={stream.primary}
                      onChange={(e) =>
                        setValue(`streams.${index}.primary`, e.target.checked)
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
