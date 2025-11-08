import { useState, useEffect } from "react";
import {
  searchArtists,
  searchReleases,
  searchRecordings,
  searchLabels,
} from "../lib/metadataClient";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ReleaseResultWithImage } from "./ReleaseResultWithImage";

type EntityType = "artists" | "releases" | "recordings" | "labels";

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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear artist filter when switching to artist search
  useEffect(() => {
    if (entityType === "artists") {
      setArtistFilter("");
    }
  }, [entityType]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!searchQuery.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let data: any[] = [];

      switch (entityType) {
        case "artists":
          data = await searchArtists(searchQuery);
          break;
        case "releases":
          data = await searchReleases(searchQuery, artistFilter || undefined);
          break;
        case "recordings":
          data = await searchRecordings(searchQuery, artistFilter || undefined);
          break;
        case "labels":
          data = await searchLabels(searchQuery);
          break;
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
      case "labels":
        return { icon: "🏷️", label: "Labels" };
    }
  };

  const entityTypeInfo = getEntityTypeLabel();

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-2xl font-bold">🎵 MusicBrainz Search</h2>
          <span className="text-sm px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full font-medium">
            {entityTypeInfo.icon} Searching {entityTypeInfo.label}
          </span>
        </div>
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Entity Type
            </label>
            <Select
              value={entityType}
              onValueChange={(value) => setEntityType(value as EntityType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Search for..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="artists">🎤 Artists</SelectItem>
                <SelectItem value="releases">💿 Albums</SelectItem>
                <SelectItem value="recordings">🎵 Songs</SelectItem>
                <SelectItem value="labels">🏷️ Labels</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Search Query
            </label>
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                entityType === "artists"
                  ? "Enter artist name..."
                  : entityType === "releases"
                  ? "Enter album name..."
                  : entityType === "labels"
                  ? "Enter label name..."
                  : "Enter song name..."
              }
              className="w-full"
            />
          </div>

          {(entityType === "releases" || entityType === "recordings") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Filter by Artist{" "}
                <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <Input
                type="text"
                value={artistFilter}
                onChange={(e) => setArtistFilter(e.target.value)}
                placeholder="e.g., Led Zeppelin"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Narrow down results to a specific artist
              </p>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Searching..." : `Search ${entityTypeInfo.label}`}
          </Button>
        </form>
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
