import { Radio, Music, User, Disc3, Building2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { IconButtonInput } from "./ui/icon-button-input";
import {
  MusicBrainzResults,
  type MusicBrainzResult,
} from "./MusicBrainzResults";
import { getMetadataClient } from "../lib/metadataClient";
import { SearchIcon } from "./ui/icons/lucide-search";
import { XIcon } from "./ui/icons/lucide-x";
import { useSearchStore } from "../stores/searchStore";

export type SearchMode = "stations" | "musicbrainz";
export type EntityType = "artists" | "releases" | "recordings" | "labels";

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
  const [entityType, setEntityType] = useState<EntityType>("recordings");
  const [musicBrainzResults, setMusicBrainzResults] = useState<
    MusicBrainzResult[]
  >([]);
  const [musicBrainzLoading, setMusicBrainzLoading] = useState(false);
  const [musicBrainzError, setMusicBrainzError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showEntitySelector, setShowEntitySelector] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const {
    searchQuery: storeSearchQuery,
    searchMode: storeSearchMode,
    triggerSearch,
    resetTrigger,
  } = useSearchStore();

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

  // Listen for triggered searches from the store (e.g., from FloatingPlayer)
  useEffect(() => {
    if (triggerSearch && storeSearchQuery) {
      setSearchMode(storeSearchMode);
      setSearchInput(storeSearchQuery);
      // Execute the search
      const executeSearch = async () => {
        setMusicBrainzLoading(true);
        setMusicBrainzError(null);
        setShowResults(true);

        try {
          const client = getMetadataClient();
          let data: any[] = [];
          switch (entityType) {
            case "artists": {
              const result = await client.SearchArtists(storeSearchQuery);
              data = result.result;
              break;
            }
            case "releases": {
              const result = await client.SearchReleases(storeSearchQuery);
              data = result.result;
              break;
            }
            case "recordings": {
              const result = await client.SearchRecordings(storeSearchQuery);
              data = result.result;
              break;
            }
            case "labels": {
              const result = await client.SearchLabels(storeSearchQuery);
              data = result.result;
              break;
            }
          }
          setMusicBrainzResults(data);
        } catch (err: any) {
          setMusicBrainzError(err.message || "Failed to search MusicBrainz");
          setMusicBrainzResults([]);
        } finally {
          setMusicBrainzLoading(false);
        }
      };
      executeSearch();
      resetTrigger();
    }
  }, [
    triggerSearch,
    storeSearchQuery,
    storeSearchMode,
    setSearchInput,
    resetTrigger,
    entityType,
  ]);

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
      const client = getMetadataClient();
      let data: any[] = [];
      switch (entityType) {
        case "artists": {
          const result = await client.SearchArtists(query);
          data = result.result;
          break;
        }
        case "releases": {
          const result = await client.SearchReleases(query);
          data = result.result;
          break;
        }
        case "recordings": {
          const result = await client.SearchRecordings(query);
          data = result.result;
          break;
        }
        case "labels": {
          const result = await client.SearchLabels(query);
          data = result.result;
          break;
        }
      }
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

  const getEntityIcon = (type: EntityType) => {
    switch (type) {
      case "artists":
        return User;
      case "releases":
        return Disc3;
      case "recordings":
        return Music;
      case "labels":
        return Building2;
    }
  };

  const getPlaceholder = () => {
    if (searchMode === "stations") return "Search stations...";
    switch (entityType) {
      case "artists":
        return "Search artists...";
      case "releases":
        return "Search albums...";
      case "recordings":
        return "Search songs...";
      case "labels":
        return "Search labels...";
    }
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
            title="Search Stations"
          >
            <Radio className="w-4 h-4" />
          </Button>

          {/* Entity Type Buttons for MusicBrainz */}
          {searchMode === "musicbrainz" ? (
            <>
              <Button
                type="button"
                variant={entityType === "artists" ? "default" : "outline"}
                onClick={() => setEntityType("artists")}
                className="px-3"
                title="Search Artists"
              >
                <User className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant={entityType === "releases" ? "default" : "outline"}
                onClick={() => setEntityType("releases")}
                className="px-3"
                title="Search Albums"
              >
                <Disc3 className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant={entityType === "recordings" ? "default" : "outline"}
                onClick={() => setEntityType("recordings")}
                className="px-3"
                title="Search Songs"
              >
                <Music className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant={entityType === "labels" ? "default" : "outline"}
                onClick={() => setEntityType("labels")}
                className="px-3"
                title="Search Labels"
              >
                <Building2 className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSearchMode("musicbrainz")}
              className="px-3"
              title="Switch to MusicBrainz Search"
            >
              <Music className="w-4 h-4" />
            </Button>
          )}

          <IconButtonInput
            type="text"
            startIcon={{
              icon: SearchIcon,
              onClick: () =>
                handleSubmit({ preventDefault: () => {} } as React.FormEvent),
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
            placeholder={getPlaceholder()}
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
