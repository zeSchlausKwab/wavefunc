import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Station } from "@wavefunc/common";
import { useSetAtom } from "jotai";
import {
  Filter,
  Link as LinkIcon,
  Pause,
  Play,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { openEditStationDrawer } from "../../atoms/ui";

interface RadioStation {
  changeuuid: string;
  stationuuid: string;
  serveruuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  iso_3166_2: string;
  state: string;
  language: string;
  languagecodes: string;
  votes: number;
  lastchangetime: string;
  lastchangetime_iso8601: string;
  codec: string;
  bitrate: number;
  hls: number;
  lastcheckok: number;
  lastchecktime: string;
  lastchecktime_iso8601: string;
  lastlocalchecktime: string;
  lastlocalchecktime_iso8601: string;
  clicktimestamp: string;
  clicktimestamp_iso8601: string;
  clickcount: number;
  clicktrend: number;
  ssl_error: number;
  geo_lat: number | null;
  geo_long: number | null;
  has_extended_info: boolean;
}

interface SearchFilters {
  name: string;
  countrycode: string;
  language: string;
  tag: string;
  codec: string;
  bitrateMin: number;
  bitrateMax: number;
}

function transformToStation(radioStations: RadioStation[]): Station[] {
  // Group stations by name
  const groupedStations = radioStations.reduce(
    (acc, station) => {
      const key = station.name.toLowerCase();
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(station);
      return acc;
    },
    {} as Record<string, RadioStation[]>
  );

  // Transform each group into a Station object
  return Object.values(groupedStations).map((stations) => {
    // Use the first station as the base for metadata
    const baseStation = stations[0];

    // Combine all unique tags
    const allTags = stations
      .map((s) =>
        s.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
      .flat();
    const uniqueTags = [...new Set(allTags)];

    // Create streams array from all stations, removing duplicates based on URL
    const uniqueStreams = stations.reduce((acc, s) => {
      const streamUrl = s.url_resolved;
      // Only add if we haven't seen this URL before
      if (!acc.some((existing) => existing.url === streamUrl)) {
        acc.push({
          url: streamUrl,
          format: s.codec.toLowerCase(),
          quality: {
            bitrate: s.bitrate,
            codec: s.codec,
            sampleRate: 44100, // Default sample rate as it's not provided by the API
          },
          primary: s.bitrate === Math.max(...stations.map((st) => st.bitrate)), // Mark highest bitrate as primary
        });
      }
      return acc;
    }, [] as any[]);

    return {
      id: baseStation.stationuuid,
      name: baseStation.name,
      description: `${baseStation.country} • ${baseStation.language || "Unknown language"}`,
      website: baseStation.homepage || "",
      genre: uniqueTags.join(", "),
      imageUrl:
        baseStation.favicon || "https://picsum.photos/seed/no-station/200/200",
      pubkey: "", // Not provided by radio-browser API
      tags: uniqueTags.map((tag) => [tag]), // Convert to array of arrays as per our spec
      streams: uniqueStreams,
      created_at: new Date(baseStation.lastchangetime_iso8601).getTime() / 1000,
      _originalStations: stations, // Keep reference to original stations for grouping
    };
  });
}

export function RadioBrowserSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [originalStations, setOriginalStations] = useState<RadioStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null
  );
  const openDrawer = useSetAtom(openEditStationDrawer);
  const [filters, setFilters] = useState<SearchFilters>({
    name: "",
    countrycode: "all",
    language: "all",
    tag: "",
    codec: "all",
    bitrateMin: 0,
    bitrateMax: 0,
  });

  const searchStations = async () => {
    if (!searchQuery.trim() && !Object.values(filters).some(Boolean)) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();

      if (searchQuery) params.append("name", searchQuery);
      if (filters.countrycode && filters.countrycode !== "all")
        params.append("countrycode", filters.countrycode);
      if (filters.language && filters.language !== "all")
        params.append("language", filters.language);
      if (filters.tag) params.append("tag", filters.tag);
      if (filters.codec && filters.codec !== "all")
        params.append("codec", filters.codec);
      if (filters.bitrateMin)
        params.append("bitrateMin", filters.bitrateMin.toString());
      if (filters.bitrateMax)
        params.append("bitrateMax", filters.bitrateMax.toString());

      params.append("limit", "20");
      params.append("hidebroken", "true");

      const response = await fetch(
        `https://at1.api.radio-browser.info/json/stations/search?${params.toString()}`
      );
      const data = await response.json();

      console.log(data);

      setOriginalStations(data);
      const transformedStations = transformToStation(data);
      setStations(transformedStations);
    } catch (error) {
      console.error("Error searching stations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      searchStations();
    }
  };

  const handleFilterChange = (
    key: keyof SearchFilters,
    value: string | number
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handlePlayPause = (station: Station) => {
    const primaryStream =
      station.streams.find((s) => s.primary) || station.streams[0];
    if (!primaryStream?.url) return;

    if (currentlyPlaying === station.id) {
      // Stop current playback
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
      setCurrentlyPlaying(null);
      setAudioElement(null);
    } else {
      // Stop any existing playback
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }

      // Create new audio element
      const audio = new Audio(primaryStream.url);
      audio.onerror = () => {
        console.error("Error playing stream:", primaryStream.url);
        setCurrentlyPlaying(null);
        setAudioElement(null);
      };
      audio.play().catch((error) => {
        console.error("Error playing stream:", error);
        setCurrentlyPlaying(null);
        setAudioElement(null);
      });

      setCurrentlyPlaying(station.id);
      setAudioElement(audio);
    }
  };

  const handleAddToLibrary = (station: Station) => {
    openDrawer(station);
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
    };
  }, [audioElement]);

  // Group original stations by name for display
  const groupedOriginalStations = originalStations.reduce(
    (acc, station) => {
      const key = station.name.toLowerCase();
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(station);
      return acc;
    },
    {} as Record<string, RadioStation[]>
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Search radio stations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1"
        />
        <Button onClick={() => setShowFilters(!showFilters)} variant="outline">
          <Filter className="w-4 h-4 mr-2" />
          Filters
        </Button>
        <Button onClick={searchStations} disabled={isLoading}>
          <Search className="w-4 h-4 mr-2" />
          Search
        </Button>
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="space-y-2">
            <label className="text-sm font-medium">Country</label>
            <Select
              value={filters.countrycode}
              onValueChange={(value) =>
                handleFilterChange("countrycode", value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="GB">United Kingdom</SelectItem>
                <SelectItem value="DE">Germany</SelectItem>
                <SelectItem value="FR">France</SelectItem>
                {/* Add more countries as needed */}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <Select
              value={filters.language}
              onValueChange={(value) => handleFilterChange("language", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                <SelectItem value="english">English</SelectItem>
                <SelectItem value="german">German</SelectItem>
                <SelectItem value="french">French</SelectItem>
                <SelectItem value="spanish">Spanish</SelectItem>
                {/* Add more languages as needed */}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Codec</label>
            <Select
              value={filters.codec}
              onValueChange={(value) => handleFilterChange("codec", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select codec" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All codecs</SelectItem>
                <SelectItem value="MP3">MP3</SelectItem>
                <SelectItem value="AAC">AAC</SelectItem>
                <SelectItem value="OGG">OGG</SelectItem>
                <SelectItem value="WMA">WMA</SelectItem>
                {/* Add more codecs as needed */}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Min Bitrate (kbps)</label>
            <Input
              type="number"
              value={filters.bitrateMin || ""}
              onChange={(e) =>
                handleFilterChange("bitrateMin", parseInt(e.target.value) || 0)
              }
              placeholder="Min bitrate"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Max Bitrate (kbps)</label>
            <Input
              type="number"
              value={filters.bitrateMax || ""}
              onChange={(e) =>
                handleFilterChange("bitrateMax", parseInt(e.target.value) || 0)
              }
              placeholder="Max bitrate"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tag</label>
            <Input
              type="text"
              value={filters.tag}
              onChange={(e) => handleFilterChange("tag", e.target.value)}
              placeholder="e.g., jazz, rock, classical"
            />
          </div>
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(groupedOriginalStations).map(([name, stations]) => (
          <div key={name} className="space-y-4">
            {stations.length > 1 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LinkIcon className="w-4 h-4" />
                  <span>{stations.length} similar stations found</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const unifiedStation = transformToStation(stations)[0];
                    openDrawer(unifiedStation);
                  }}
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Unify All Streams
                </Button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stations.map((station) => (
                <Card
                  key={station.stationuuid}
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-4">
                      <div className="relative w-16 h-16 flex-shrink-0">
                        <img
                          src={
                            station.favicon ||
                            "https://picsum.photos/seed/no-station/200/200"
                          }
                          alt={station.name}
                          className="w-full h-full object-cover rounded-md"
                        />
                        <div className="absolute bottom-0 right-0 flex gap-1">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="rounded-full w-8 h-8"
                            onClick={() =>
                              handlePlayPause({
                                id: station.stationuuid,
                                name: station.name,
                                description: `${station.country} • ${station.language || "Unknown language"}`,
                                website: station.homepage || "",
                                genre: station.tags,
                                imageUrl:
                                  station.favicon ||
                                  "https://picsum.photos/seed/no-station/200/200",
                                pubkey: "",
                                tags: station.tags
                                  .split(",")
                                  .map((tag) => [tag.trim()]),
                                streams: [
                                  {
                                    url: station.url_resolved,
                                    format: station.codec.toLowerCase(),
                                    quality: {
                                      bitrate: station.bitrate,
                                      codec: station.codec,
                                      sampleRate: 44100,
                                    },
                                    primary: true,
                                  },
                                ],
                                created_at:
                                  new Date(
                                    station.lastchangetime_iso8601
                                  ).getTime() / 1000,
                              })
                            }
                            disabled={!station.url_resolved}
                          >
                            {currentlyPlaying === station.stationuuid ?
                              <Pause className="w-4 h-4" />
                            : <Play className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="secondary"
                            className="rounded-full w-8 h-8"
                            onClick={() => {
                              const transformedStation = stations.find(
                                (s) => s.stationuuid === station.stationuuid
                              );
                              if (transformedStation) {
                                const unifiedStation = transformToStation([
                                  transformedStation,
                                ])[0];
                                openDrawer(unifiedStation);
                              }
                            }}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-primary font-press-start-2p truncate">
                          {station.name}
                        </h3>
                        <p className="text-sm text-muted-foreground font-press-start-2p mt-1">
                          {station.country} •{" "}
                          {station.language || "Unknown language"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {station.tags
                            .split(",")
                            .slice(0, 3)
                            .map((tag) => (
                              <span
                                key={tag}
                                className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full"
                              >
                                {tag.trim()}
                              </span>
                            ))}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground font-press-start-2p">
                          <p>Quality: {station.bitrate} kbps</p>
                          <p>Codec: {station.codec}</p>
                          {station.homepage && (
                            <a
                              href={station.homepage}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline mt-1 block"
                            >
                              Visit Website
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
