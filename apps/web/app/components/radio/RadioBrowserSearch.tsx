import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RadioStation {
  id: string;
  name: string;
  url: string;
  url_resolved: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  language: string;
  languagecodes: string[];
  votes: number;
  codec: string;
  bitrate: number;
  homepage: string;
  state: string;
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

export function RadioBrowserSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    name: "",
    countrycode: "",
    language: "",
    tag: "",
    codec: "",
    bitrateMin: 0,
    bitrateMax: 0,
  });

  const searchStations = async () => {
    if (!searchQuery.trim() && !Object.values(filters).some(Boolean)) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();

      if (searchQuery) params.append("name", searchQuery);
      if (filters.countrycode)
        params.append("countrycode", filters.countrycode);
      if (filters.language) params.append("language", filters.language);
      if (filters.tag) params.append("tag", filters.tag);
      if (filters.codec) params.append("codec", filters.codec);
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
      setStations(data);
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
                <SelectItem value="">All countries</SelectItem>
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
                <SelectItem value="">All languages</SelectItem>
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
                <SelectItem value="">All codecs</SelectItem>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stations.map((station) => (
          <Card key={station.id} className="hover:shadow-lg transition-shadow">
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
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-primary font-press-start-2p truncate">
                    {station.name}
                  </h3>
                  <p className="text-sm text-muted-foreground font-press-start-2p mt-1">
                    {station.country} • {station.language}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {station.tags
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                      .slice(0, 3)
                      .map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground font-press-start-2p">
                    <p>
                      Bitrate:{" "}
                      {station.bitrate ? `${station.bitrate} kbps` : "Unknown"}
                    </p>
                    <p>Codec: {station.codec || "Unknown"}</p>
                    <p>Votes: {station.votes}</p>
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
  );
}
