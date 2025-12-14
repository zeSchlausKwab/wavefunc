import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { Plus, Edit3, Trash2, RadioIcon } from "lucide-react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { NDKStation } from "../lib/NDKStation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

export interface Stream {
  url: string;
  format: string;
  quality: {
    bitrate: number;
    codec: string;
    sampleRate: number;
  };
  primary?: boolean;
}

export interface StationFormData {
  name: string;
  description: string;
  thumbnail?: string;
  website?: string;
  location?: string;
  countryCode?: string;
  genres: string[];
  languages: string[];
  streams: Stream[];
}

interface StationManagementSheetProps {
  station?: NDKStation;
  mode?: "add" | "edit";
  trigger?: React.ReactNode;
}

export const StationManagementSheet: React.FC<StationManagementSheetProps> = ({
  station,
  mode = "add",
  trigger,
}) => {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sample test data for development
  const testData: StationFormData = {
    name: "Test Jazz FM 102.3",
    description:
      "A smooth jazz radio station playing the best contemporary and classic jazz music 24/7. Perfect for relaxing, working, or just enjoying quality music.",
    thumbnail: "https://picsum.photos/seed/jazz/400/400",
    website: "https://example.com/jazzfm",
    location: "New York, NY",
    countryCode: "US",
    genres: ["jazz", "smooth jazz", "contemporary jazz", "fusion"],
    languages: ["english"],
    streams: [
      {
        url: "https://stream.example.com/jazz-high.mp3",
        format: "mp3",
        quality: {
          bitrate: 320,
          codec: "mp3",
          sampleRate: 48000,
        },
        primary: true,
      },
      {
        url: "https://stream.example.com/jazz-medium.aac",
        format: "aac",
        quality: {
          bitrate: 128,
          codec: "aac",
          sampleRate: 44100,
        },
        primary: false,
      },
    ],
  };

  const form = useForm({
    defaultValues: {
      name: station?.name || "",
      description: station?.description || "",
      thumbnail: station?.thumbnail || "",
      website: station?.website || "",
      location: station?.location || "",
      countryCode: station?.countryCode || "",
      genres: station?.genres || [],
      languages: station?.languages || [],
      streams: station?.streams || [
        {
          url: "",
          format: "mp3",
          quality: {
            bitrate: 128,
            codec: "mp3",
            sampleRate: 44100,
          },
          primary: true,
        },
      ],
    },
    onSubmit: async ({ value }) => {
      if (!ndk || !currentUser?.pubkey) {
        console.error("NDK or user not available");
        return;
      }

      setIsSubmitting(true);
      try {
        let targetStation: NDKStation;

        if (mode === "edit" && station) {
          targetStation = station;
        } else {
          targetStation = new NDKStation(ndk);
          targetStation.pubkey = currentUser.pubkey;
          targetStation.stationId = crypto.randomUUID();
        }

        // Update station properties
        targetStation.name = value.name;
        targetStation.description = value.description;
        if (value.thumbnail) targetStation.thumbnail = value.thumbnail;
        if (value.website) targetStation.website = value.website;
        if (value.location) targetStation.location = value.location;
        if (value.countryCode) targetStation.countryCode = value.countryCode;

        // Set genres and languages
        targetStation.setGenres(value.genres);
        targetStation.setLanguages(value.languages);

        // Set streams - update content with streams data
        const content = {
          description: value.description,
          streams: value.streams,
        };
        targetStation.content = JSON.stringify(content);

        // Ensure NDK is connected
        if (!ndk.pool || ndk.pool.connectedRelays().length === 0) {
          console.log("Connecting to relays...");
          await ndk.connect();
          // Wait a bit for connection to establish
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        console.log(
          "Connected relays:",
          ndk.pool?.connectedRelays().map((r) => r.url)
        );

        await targetStation.sign();

        const relays = await targetStation.publish();
        console.log("Published to relays:", relays);

        if (relays.size === 0) {
          throw new Error(
            "Failed to publish to any relay. Check if the relay is running and accepting connections."
          );
        }

        setOpen(false);
        console.log(
          `Station ${mode === "edit" ? "updated" : "created"} successfully to ${
            relays.size
          } relay(s)`
        );
      } catch (error) {
        console.error(`Failed to ${mode} station:`, error);
        alert(
          `Failed to ${mode} station: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const handleDelete = async () => {
    if (!station || !ndk) return;

    if (
      !confirm(
        "Are you sure you want to delete this station? This action cannot be undone."
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Create a deletion event (kind 5)
      const deleteEvent = {
        kind: 5,
        content: "Station deleted",
        tags: [
          ["e", station.id],
          ["k", "31237"],
        ],
      };

      const ndkDeleteEvent = new (
        await import("@nostr-dev-kit/react")
      ).NDKEvent(ndk, deleteEvent);
      ndkDeleteEvent.pubkey = station.pubkey;

      await ndkDeleteEvent.sign();
      await ndkDeleteEvent.publish();

      setOpen(false);
      console.log("Station deleted successfully");
    } catch (error) {
      console.error("Failed to delete station:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addStream = () => {
    const currentStreams = form.getFieldValue("streams");
    form.setFieldValue("streams", [
      ...currentStreams,
      {
        url: "",
        format: "mp3",
        quality: {
          bitrate: 128,
          codec: "mp3",
          sampleRate: 44100,
        },
        primary: false,
      },
    ]);
  };

  const removeStream = (index: number) => {
    const currentStreams = form.getFieldValue("streams");
    if (currentStreams.length > 1) {
      form.setFieldValue(
        "streams",
        currentStreams.filter((_, i) => i !== index)
      );
    }
  };

  const addGenre = (genre: string) => {
    if (!genre.trim()) return;
    const currentGenres = form.getFieldValue("genres");
    if (!currentGenres.includes(genre.trim())) {
      form.setFieldValue("genres", [...currentGenres, genre.trim()]);
    }
  };

  const removeGenre = (index: number) => {
    const currentGenres = form.getFieldValue("genres");
    form.setFieldValue(
      "genres",
      currentGenres.filter((_, i) => i !== index)
    );
  };

  const addLanguage = (language: string) => {
    if (!language.trim()) return;
    const currentLanguages = form.getFieldValue("languages");
    if (!currentLanguages.includes(language.trim())) {
      form.setFieldValue("languages", [...currentLanguages, language.trim()]);
    }
  };

  const removeLanguage = (index: number) => {
    const currentLanguages = form.getFieldValue("languages");
    form.setFieldValue(
      "languages",
      currentLanguages.filter((_, i) => i !== index)
    );
  };

  const fillTestData = () => {
    form.setFieldValue("name", testData.name);
    form.setFieldValue("description", testData.description);
    form.setFieldValue("thumbnail", testData.thumbnail || "");
    form.setFieldValue("website", testData.website || "");
    form.setFieldValue("location", testData.location || "");
    form.setFieldValue("countryCode", testData.countryCode || "");
    form.setFieldValue("genres", testData.genres);
    form.setFieldValue("languages", testData.languages);
    form.setFieldValue("streams", testData.streams);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            {mode === "add" ? (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add Station
              </>
            ) : (
              <>
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Station
              </>
            )}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-4">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <RadioIcon className="w-5 h-5" />
                {mode === "add"
                  ? "Add New Station"
                  : `Edit ${station?.name || "Station"}`}
              </SheetTitle>
              <SheetDescription>
                {mode === "add"
                  ? "Create a new radio station for the Nostr network."
                  : "Update the station information and broadcast changes."}
              </SheetDescription>
            </div>
            {process.env.NODE_ENV === "development" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fillTestData}
              >
                🧪 Fill Test Data
              </Button>
            )}
          </div>
        </SheetHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-6 py-4"
        >
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Basic Information</h3>

            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) =>
                  !value ? "Station name is required" : undefined,
              }}
            >
              {(field) => (
                <div>
                  <Label htmlFor={field.name}>Station Name *</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g., Jazz FM 102.3"
                  />
                  {field.state.meta.errors && (
                    <p className="text-sm text-red-500 mt-1">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field
              name="description"
              validators={{
                onChange: ({ value }) =>
                  !value ? "Description is required" : undefined,
              }}
            >
              {(field) => (
                <div>
                  <Label htmlFor={field.name}>Description *</Label>
                  <textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Describe your radio station..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y"
                  />
                  {field.state.meta.errors && (
                    <p className="text-sm text-red-500 mt-1">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </div>
              )}
            </form.Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <form.Field name="thumbnail">
                {(field) => (
                  <div>
                    <Label htmlFor={field.name}>Thumbnail URL</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="https://example.com/thumbnail.jpg"
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="website">
                {(field) => (
                  <div>
                    <Label htmlFor={field.name}>Website URL</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="location">
                {(field) => (
                  <div>
                    <Label htmlFor={field.name}>Location</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="e.g., New York, NY"
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="countryCode">
                {(field) => (
                  <div>
                    <Label htmlFor={field.name}>Country Code</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="e.g., US"
                      maxLength={2}
                    />
                  </div>
                )}
              </form.Field>
            </div>
          </div>

          {/* Streams */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Streams *</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addStream}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Stream
              </Button>
            </div>

            <form.Field name="streams">
              {(field) => (
                <div className="space-y-3">
                  {field.state.value.map((stream, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Stream {index + 1}</h4>
                        {field.state.value.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeStream(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>Stream URL *</Label>
                          <Input
                            value={stream.url}
                            onChange={(e) => {
                              const newStreams = [...field.state.value];
                              newStreams[index] = {
                                ...stream,
                                url: e.target.value,
                              };
                              field.handleChange(newStreams);
                            }}
                            placeholder="https://example.com/stream.mp3"
                          />
                        </div>

                        <div>
                          <Label>Format</Label>
                          <Input
                            value={stream.format}
                            onChange={(e) => {
                              const newStreams = [...field.state.value];
                              newStreams[index] = {
                                ...stream,
                                format: e.target.value,
                              };
                              field.handleChange(newStreams);
                            }}
                            placeholder="mp3"
                          />
                        </div>

                        <div>
                          <Label>Bitrate (kbps)</Label>
                          <Input
                            type="number"
                            value={stream.quality.bitrate}
                            onChange={(e) => {
                              const newStreams = [...field.state.value];
                              newStreams[index] = {
                                ...stream,
                                quality: {
                                  ...stream.quality,
                                  bitrate: Number(e.target.value),
                                },
                              };
                              field.handleChange(newStreams);
                            }}
                            placeholder="128"
                          />
                        </div>

                        <div>
                          <Label>Codec</Label>
                          <Input
                            value={stream.quality.codec}
                            onChange={(e) => {
                              const newStreams = [...field.state.value];
                              newStreams[index] = {
                                ...stream,
                                quality: {
                                  ...stream.quality,
                                  codec: e.target.value,
                                },
                              };
                              field.handleChange(newStreams);
                            }}
                            placeholder="mp3"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          {/* Genres */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Genres</h3>
            <form.Field name="genres">
              {(field) => (
                <div>
                  <div className="flex gap-2 mb-2">
                    <Input
                      placeholder="Add genre (e.g., jazz, rock, classical)"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addGenre(e.currentTarget.value);
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {field.state.value.map((genre, index) => (
                      <span
                        key={index}
                        className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm flex items-center gap-1"
                      >
                        {genre}
                        <Button
                          type="button"
                          onClick={() => removeGenre(index)}
                          className="hover:bg-blue-200 rounded-full p-0.5"
                        >
                          ×
                        </Button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </form.Field>
          </div>

          {/* Languages */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Languages</h3>
            <form.Field name="languages">
              {(field) => (
                <div>
                  <div className="flex gap-2 mb-2">
                    <Input
                      placeholder="Add language (e.g., english, spanish, french)"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addLanguage(e.currentTarget.value);
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {field.state.value.map((language, index) => (
                      <span
                        key={index}
                        className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-sm flex items-center gap-1"
                      >
                        {language}
                        <Button
                          type="button"
                          onClick={() => removeLanguage(index)}
                          className="hover:bg-green-200 rounded-full p-0.5"
                        >
                          ×
                        </Button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </form.Field>
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <div>
              {mode === "edit" && station && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Station
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : mode === "add"
                  ? "Create Station"
                  : "Update Station"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};
