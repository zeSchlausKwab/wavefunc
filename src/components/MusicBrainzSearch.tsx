import { useState, useEffect } from "react";
import { getMetadataClient } from "../lib/metadataClient";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ReleaseResultWithImage } from "./ReleaseResultWithImage";

type EntityType =
  | "artists"
  | "releases"
  | "recordings"
  | "recordings_advanced"
  | "labels";

interface BaseResult {
  id: string;
  score: number;
  tags?: string[];
}

interface ArtistResult extends BaseResult {
  type: "artist";
  name: string;
  sortName: string;
  country?: string;
  beginDate?: string;
  endDate?: string;
  type_?: string;
  disambiguation?: string;
}

interface ReleaseResult extends BaseResult {
  type: "release";
  title: string;
  artist: string;
  artistId?: string;
  date?: string;
  country?: string;
  trackCount?: number;
  status?: string;
  barcode?: string;
}

interface RecordingResult extends BaseResult {
  type: "recording";
  title: string;
  artist: string;
  artistId?: string;
  release?: string;
  releaseDate?: string;
  duration?: number;
}

interface LabelResult extends BaseResult {
  type: "label";
  name: string;
  sortName: string;
  country?: string;
  type_?: string;
  labelCode?: string;
  disambiguation?: string;
}

type SearchResult =
  | ArtistResult
  | ReleaseResult
  | RecordingResult
  | LabelResult;

export function MusicBrainzSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("recordings");
  const [artistFilter, setArtistFilter] = useState("");
  const [releaseFilter, setReleaseFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear filters when switching search types
  useEffect(() => {
    if (entityType === "artists" || entityType === "labels") {
      setArtistFilter("");
      setReleaseFilter("");
      setCountryFilter("");
      setDateFilter("");
    } else if (entityType === "recordings") {
      setReleaseFilter("");
      setCountryFilter("");
      setDateFilter("");
    }
  }, [entityType]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    // For advanced search, at least one field must be filled
    if (entityType === "recordings_advanced") {
      if (
        !searchQuery.trim() &&
        !artistFilter.trim() &&
        !releaseFilter.trim()
      ) {
        setError("Please enter at least one search field");
        return;
      }
    } else if (!searchQuery.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getMetadataClient();
      let data: any[] = [];

      switch (entityType) {
        case "artists": {
          const result = await client.SearchArtists(searchQuery);
          data = result.result;
          break;
        }
        case "releases": {
          const result = await client.SearchReleases(searchQuery, artistFilter || undefined);
          data = result.result;
          break;
        }
        case "recordings": {
          const result = await client.SearchRecordings(searchQuery, artistFilter || undefined);
          data = result.result;
          break;
        }
        case "recordings_advanced": {
          const result = await client.SearchRecordingsCombined(
            searchQuery || undefined,
            artistFilter || undefined,
            releaseFilter || undefined,
            undefined, // isrc
            countryFilter || undefined,
            dateFilter || undefined,
            undefined, // duration
          );
          data = result.result;
          break;
        }
        case "labels": {
          const result = await client.SearchLabels(searchQuery);
          data = result.result;
          break;
        }
      }

      setResults(data);
    } catch (err: any) {
      setError(err.message || "Failed to search MusicBrainz");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return null;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const renderResult = (result: SearchResult) => {
    if (result.type === "artist") {
      const artist = result as ArtistResult;
      return (
        <Card
          key={artist.id}
          className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
          onClick={() => {
            // Future: trigger artist search in main UI
            console.log("Artist clicked:", artist.name);
          }}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h4 className="font-bold text-lg">
                🎤 {artist.name}
                {artist.disambiguation && (
                  <span className="text-sm text-gray-500 ml-2">
                    ({artist.disambiguation})
                  </span>
                )}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {artist.sortName}
              </p>
              <div className="flex gap-3 mt-1 text-sm text-gray-500 dark:text-gray-500">
                {artist.country && <span>🌍 {artist.country}</span>}
                {artist.type_ && (
                  <span className="capitalize">{artist.type_}</span>
                )}
                {artist.beginDate && (
                  <span>
                    📅 {artist.beginDate}
                    {artist.endDate && ` - ${artist.endDate}`}
                  </span>
                )}
              </div>
              {artist.tags && artist.tags.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {artist.tags.slice(0, 5).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="ml-4 text-right">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Score: {artist.score}
              </div>
              <a
                href={`https://musicbrainz.org/artist/${artist.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600 text-sm mt-1 inline-block"
                onClick={(e) => e.stopPropagation()}
              >
                View on MusicBrainz →
              </a>
            </div>
          </div>
        </Card>
      );
    }

    if (result.type === "release") {
      const release = result as ReleaseResult;
      return (
        <ReleaseResultWithImage
          key={release.id}
          release={release}
          onClick={() => {
            // Future: trigger release search in main UI
            console.log("Release clicked:", release.title);
          }}
          onArtistClick={() => {
            console.log("Artist clicked:", release.artist);
          }}
        />
      );
    }

    if (result.type === "recording") {
      const recording = result as RecordingResult;
      return (
        <Card
          key={recording.id}
          className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
          onClick={() => {
            // Future: trigger recording search in main UI
            console.log("Recording clicked:", recording.title);
          }}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h4 className="font-bold text-lg">🎵 {recording.title}</h4>
              <p
                className="text-gray-600 dark:text-gray-400 cursor-pointer hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("Artist clicked:", recording.artist);
                }}
              >
                {recording.artist}
              </p>
              {recording.release && (
                <p
                  className="text-sm text-gray-500 dark:text-gray-500 mt-1 cursor-pointer hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log("Release clicked:", recording.release);
                  }}
                >
                  📀 {recording.release}
                  {recording.releaseDate && ` (${recording.releaseDate})`}
                </p>
              )}
              {recording.duration && (
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  ⏱️ {formatDuration(recording.duration)}
                </p>
              )}
              {recording.tags && recording.tags.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {recording.tags.slice(0, 5).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="ml-4 text-right">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Score: {recording.score}
              </div>
              <a
                href={`https://musicbrainz.org/recording/${recording.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600 text-sm mt-1 inline-block"
                onClick={(e) => e.stopPropagation()}
              >
                View on MusicBrainz →
              </a>
            </div>
          </div>
        </Card>
      );
    }

    return null;
  };

  const getEntityTypeLabel = () => {
    switch (entityType) {
      case "artists":
        return { icon: "🎤", label: "Artists" };
      case "releases":
        return { icon: "💿", label: "Albums" };
      case "recordings":
        return { icon: "🎵", label: "Songs" };
      case "recordings_advanced":
        return { icon: "🔍", label: "Songs (Advanced)" };
      case "labels":
        return { icon: "🏷️", label: "Labels" };
      default:
        return { icon: "🔍", label: "Results" };
    }
  };

  const entityTypeInfo = getEntityTypeLabel();

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-6">🎵 MusicBrainz Search</h2>

        <Tabs
          value={entityType}
          onValueChange={(value) => setEntityType(value as EntityType)}
        >
          <div className="w-full overflow-x-auto mb-6">
            <TabsList className="w-full justify-start min-w-max">
              <TabsTrigger value="recordings" className="gap-2">
                🎵 <span className="hidden sm:inline">Songs</span>
              </TabsTrigger>
              <TabsTrigger value="recordings_advanced" className="gap-2">
                🔍 <span className="hidden sm:inline">Songs (Advanced)</span>
              </TabsTrigger>
              <TabsTrigger value="artists" className="gap-2">
                🎤 <span className="hidden sm:inline">Artists</span>
              </TabsTrigger>
              <TabsTrigger value="releases" className="gap-2">
                💿 <span className="hidden sm:inline">Albums</span>
              </TabsTrigger>
              <TabsTrigger value="labels" className="gap-2">
                🏷️ <span className="hidden sm:inline">Labels</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Songs Tab */}
          <TabsContent value="recordings" className="mt-0">
            <form onSubmit={handleSearch} className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Song Title
                </label>
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter song name..."
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Artist Name{" "}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <Input
                  type="text"
                  value={artistFilter}
                  onChange={(e) => setArtistFilter(e.target.value)}
                  placeholder="e.g., Led Zeppelin"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Searching..." : "Search Songs"}
              </Button>
            </form>
          </TabsContent>

          {/* Advanced Songs Tab */}
          <TabsContent value="recordings_advanced" className="mt-0">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                💡 <strong>Advanced Search:</strong> Fill in any combination of
                fields to find specific recordings. Use quotes for exact matches
                (e.g., "young men dead" by "the black angels").
              </p>
            </div>

            <form onSubmit={handleSearch} className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Song Title{" "}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='e.g., young men dead or "young men dead"'
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Artist Name{" "}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <Input
                  type="text"
                  value={artistFilter}
                  onChange={(e) => setArtistFilter(e.target.value)}
                  placeholder='e.g., the black angels or "the black angels"'
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Use quotes for exact artist name match
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Album/Release{" "}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <Input
                  type="text"
                  value={releaseFilter}
                  onChange={(e) => setReleaseFilter(e.target.value)}
                  placeholder="e.g., Passover"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Country{" "}
                    <span className="text-gray-500 font-normal">
                      (optional)
                    </span>
                  </label>
                  <Input
                    type="text"
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    placeholder="e.g., US, GB"
                    maxLength={2}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Release Date{" "}
                    <span className="text-gray-500 font-normal">
                      (optional)
                    </span>
                  </label>
                  <Input
                    type="text"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    placeholder="YYYY or YYYY-MM-DD"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Searching..." : "Search Songs (Advanced)"}
              </Button>
            </form>
          </TabsContent>

          {/* Artists Tab */}
          <TabsContent value="artists" className="mt-0">
            <form onSubmit={handleSearch} className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Artist Name
                </label>
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter artist name..."
                  className="w-full"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Searching..." : "Search Artists"}
              </Button>
            </form>
          </TabsContent>

          {/* Albums Tab */}
          <TabsContent value="releases" className="mt-0">
            <form onSubmit={handleSearch} className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Album Title
                </label>
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter album name..."
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Artist Name{" "}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <Input
                  type="text"
                  value={artistFilter}
                  onChange={(e) => setArtistFilter(e.target.value)}
                  placeholder="e.g., Led Zeppelin"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Searching..." : "Search Albums"}
              </Button>
            </form>
          </TabsContent>

          {/* Labels Tab */}
          <TabsContent value="labels" className="mt-0">
            <form onSubmit={handleSearch} className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Label Name
                </label>
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter label name..."
                  className="w-full"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Searching..." : "Search Labels"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
          ❌ {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">
              {entityTypeInfo.icon} {entityTypeInfo.label} Results
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({results.length} found)
            </span>
          </div>
          {results.map(renderResult)}
        </div>
      )}

      {!loading && results.length === 0 && searchQuery && !error && (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          <div className="text-lg mb-2">{entityTypeInfo.icon}</div>
          <div>
            No {entityTypeInfo.label.toLowerCase()} found for "{searchQuery}"
          </div>
        </div>
      )}
    </div>
  );
}
