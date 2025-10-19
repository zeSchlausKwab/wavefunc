import { Radio, Music } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { IconButtonInput } from "./ui/icon-button-input";
import { MusicBrainzResults, type MusicBrainzResult } from "./MusicBrainzResults";
import { searchMusicBrainz } from "../lib/metadataClient";
import { SearchIcon } from "./ui/icons/lucide-search";
import { XIcon } from "./ui/icons/lucide-x";

export type SearchMode = "stations" | "musicbrainz";

interface UnifiedSearchInputProps {
  searchInput: string;
  setSearchInput: (query: string) => void;
  onStationSearch: (query: string) => void;
}

export function UnifiedSearchInput({
  searchInput,
  setSearchInput,
  onStationSearch,
}: UnifiedSearchInputProps) {
  const [searchMode, setSearchMode] = useState<SearchMode>("stations");
  const [musicBrainzResults, setMusicBrainzResults] = useState<MusicBrainzResult[]>([]);
  const [musicBrainzLoading, setMusicBrainzLoading] = useState(false);
  const [musicBrainzError, setMusicBrainzError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clear results when switching modes
  useEffect(() => {
    setMusicBrainzResults([]);
    setMusicBrainzError(null);
    setShowResults(false);
  }, [searchMode]);

  const handleMusicBrainzSearch = async (query: string) => {
    if (!query.trim()) {
      setMusicBrainzResults([]);
      setShowResults(false);
      return;
    }

    setMusicBrainzLoading(true);
    setMusicBrainzError(null);
    setShowResults(true);

    try {
      const data = await searchMusicBrainz({ query });
      setMusicBrainzResults(data);
    } catch (err: any) {
      setMusicBrainzError(err.message || "Failed to search MusicBrainz");
      setMusicBrainzResults([]);
    } finally {
      setMusicBrainzLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchMode === "stations") {
      console.log(`🔍 Searching stations for: "${searchInput}"`);
      onStationSearch(searchInput);
      setShowResults(false);
    } else {
      handleMusicBrainzSearch(searchInput);
    }
  };

  const handleClear = () => {
    setSearchInput("");
    if (searchMode === "stations") {
      onStationSearch("");
    } else {
      setMusicBrainzResults([]);
      setMusicBrainzError(null);
    }
    setShowResults(false);
  };

  return (
    <div className="relative w-full" ref={searchContainerRef}>
      <form onSubmit={handleSubmit}>
        <ButtonGroup className="w-full">
          <Button
            type="button"
            variant={searchMode === "stations" ? "default" : "outline"}
            onClick={() => setSearchMode("stations")}
            className="px-3"
          >
            <Radio className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant={searchMode === "musicbrainz" ? "default" : "outline"}
            onClick={() => setSearchMode("musicbrainz")}
            className="px-3"
          >
            <Music className="w-4 h-4" />
          </Button>
          <IconButtonInput
            type="text"
            startIcon={{
              icon: SearchIcon,
              onClick: () => handleSubmit({ preventDefault: () => {} } as React.FormEvent),
              disabled: !searchInput.trim(),
              type: "submit",
              title: "Search",
            }}
            endIcon={
              searchInput
                ? {
                    icon: XIcon,
                    onClick: handleClear,
                    title: "Clear search",
                  }
                : undefined
            }
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchInput(e.target.value)
            }
            placeholder={
              searchMode === "stations"
                ? "Search stations..."
                : "Search artists or tracks..."
            }
            className="flex-1"
          />
        </ButtonGroup>
      </form>

      {/* MusicBrainz Results Dropdown */}
      {searchMode === "musicbrainz" && showResults && (
        <MusicBrainzResults
          results={musicBrainzResults}
          loading={musicBrainzLoading}
          error={musicBrainzError}
        />
      )}
    </div>
  );
}
