import { useState } from "react";
import { searchMusicBrainz } from "../lib/metadataClient";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

interface MusicBrainzResult {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  release?: string;
  releaseDate?: string;
  duration?: number;
  score: number;
  tags?: string[];
}

export function MusicBrainzSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<MusicBrainzResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!searchQuery.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await searchMusicBrainz({ query: searchQuery });
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

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">🎵 MusicBrainz Search</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for artist or track..."
          />
          <Button
            type="submit"
            disabled={loading}
          >
            {loading ? "Searching..." : "Search"}
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
          <h3 className="text-lg font-semibold">Results ({results.length})</h3>
          {results.map((result) => (
            <Card
              key={result.id}
              className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h4 className="font-bold text-lg">{result.title}</h4>
                  <p className="text-gray-600 dark:text-gray-400">
                    {result.artist}
                  </p>
                  {result.release && (
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                      📀 {result.release}
                      {result.releaseDate && ` (${result.releaseDate})`}
                    </p>
                  )}
                  {result.duration && (
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                      ⏱️ {formatDuration(result.duration)}
                    </p>
                  )}
                  {result.tags && result.tags.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {result.tags.map((tag) => (
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
                    Score: {result.score}
                  </div>
                  <a
                    href={`https://musicbrainz.org/recording/${result.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600 text-sm mt-1 inline-block"
                  >
                    View on MusicBrainz →
                  </a>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && searchQuery && !error && (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          No results found for "{searchQuery}"
        </div>
      )}
    </div>
  );
}
