import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Globe, Languages, Music, Search } from "lucide-react";
import { useState } from "react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { useStationsObserver } from "../lib/hooks/useStations";
import { useFilterStore } from "../stores/filterStore";

export const Route = createFileRoute("/browse/genres")({
  component: BrowseGenres,
});

type FilterType = "genres" | "languages" | "countries";

function BrowseGenres() {
  const navigate = useNavigate();
  const { setGenres, setLanguages, setCountries } = useFilterStore();
  const { events, eose } = useStationsObserver({ limit: 500 });
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterType>("genres");

  // Extract and count all genres from stations
  const genreCounts = events.reduce((acc, station) => {
    station.genres.forEach((genre) => {
      const normalizedGenre = genre.toLowerCase();
      acc[normalizedGenre] = (acc[normalizedGenre] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  // Extract and count all languages from stations
  const languageCounts = events.reduce((acc, station) => {
    station.languages.forEach((language) => {
      const normalizedLanguage = language.toLowerCase();
      acc[normalizedLanguage] = (acc[normalizedLanguage] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  // Extract and count all countries from stations
  const countryCounts = events.reduce((acc, station) => {
    const country = station.countryCode;
    if (country) {
      const normalizedCountry = country.toUpperCase();
      acc[normalizedCountry] = (acc[normalizedCountry] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // Sort by popularity
  const sortedGenres = Object.entries(genreCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .map(([genre, count]) => ({ item: genre, count }));

  const sortedLanguages = Object.entries(languageCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .map(([language, count]) => ({ item: language, count }));

  const sortedCountries = Object.entries(countryCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .map(([country, count]) => ({ item: country, count }));

  // Filter based on search query
  const filteredGenres = sortedGenres.filter(({ item }) =>
    item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLanguages = sortedLanguages.filter(({ item }) =>
    item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCountries = sortedCountries.filter(({ item }) =>
    item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleGenreClick = (genre: string) => {
    setGenres([genre]);
    navigate({ to: "/", search: {} });
  };

  const handleLanguageClick = (language: string) => {
    setLanguages([language]);
    navigate({ to: "/", search: {} });
  };

  const handleCountryClick = (country: string) => {
    setCountries([country]);
    navigate({ to: "/", search: {} });
  };

  // Reset search when switching tabs
  const handleTabChange = (value: string) => {
    setActiveTab(value as FilterType);
    setSearchQuery("");
  };

  // Helper to get data for current tab
  const getCurrentData = () => {
    switch (activeTab) {
      case "genres":
        return { sorted: sortedGenres, filtered: filteredGenres };
      case "languages":
        return { sorted: sortedLanguages, filtered: filteredLanguages };
      case "countries":
        return { sorted: sortedCountries, filtered: filteredCountries };
    }
  };

  const getTabConfig = (type: FilterType) => {
    switch (type) {
      case "genres":
        return {
          title: "Browse by Genre",
          description: "Discover radio stations by musical genre",
          placeholder: "Search genres...",
          icon: Music,
          emptyMessage: "No genres found",
          noResultsMessage: "No genres match your search",
        };
      case "languages":
        return {
          title: "Browse by Language",
          description: "Discover radio stations by language",
          placeholder: "Search languages...",
          icon: Languages,
          emptyMessage: "No languages found",
          noResultsMessage: "No languages match your search",
        };
      case "countries":
        return {
          title: "Browse by Country",
          description: "Discover radio stations by country",
          placeholder: "Search countries...",
          icon: Globe,
          emptyMessage: "No countries found",
          noResultsMessage: "No countries match your search",
        };
    }
  };

  const handleItemClick = (item: string) => {
    switch (activeTab) {
      case "genres":
        handleGenreClick(item);
        break;
      case "languages":
        handleLanguageClick(item);
        break;
      case "countries":
        handleCountryClick(item);
        break;
    }
  };

  const currentData = getCurrentData();
  const config = getTabConfig(activeTab);
  const Icon = config.icon;

  return (
    <div className="flex flex-col space-y-6 items-start min-h-[calc(100vh-12rem)]">
      {/* Header */}
      <div className="flex items-center justify-between w-full">
        <div>
          <h1 className="text-3xl font-bold">{config.title}</h1>
          <p className="text-gray-600 mt-2">{config.description}</p>
        </div>
        {eose && currentData.sorted.length > 0 && (
          <span className="text-sm text-gray-600">
            {currentData.filtered.length} of {currentData.sorted.length}{" "}
            {activeTab === "countries" ? "countr" : activeTab.slice(0, -1)}
            {currentData.sorted.length !== 1
              ? activeTab === "countries"
                ? "ies"
                : "s"
              : activeTab === "countries"
              ? "y"
              : ""}
          </span>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="genres">
            <Music className="w-4 h-4" />
            Genres
          </TabsTrigger>
          <TabsTrigger value="languages">
            <Languages className="w-4 h-4" />
            Languages
          </TabsTrigger>
          <TabsTrigger value="countries">
            <Globe className="w-4 h-4" />
            Countries
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 w-full">
          {/* Search Input */}
          {eose && currentData.sorted.length > 0 && (
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder={config.placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {/* Loading state */}
          {!eose && (
            <div className="text-center text-muted-foreground py-8 w-full">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-2"></div>
              <p>Loading {activeTab}...</p>
            </div>
          )}

          {/* Grid */}
          {eose && currentData.filtered.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full items-start content-start">
              {currentData.filtered.map(({ item, count }) => (
                <Card
                  key={item}
                  className="p-4 cursor-pointer hover:shadow-lg hover:border-primary transition-all group"
                  onClick={() => handleItemClick(item)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-lg capitalize truncate">
                          {item}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {count} station{count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* No results from search */}
          {eose &&
            currentData.sorted.length > 0 &&
            currentData.filtered.length === 0 && (
              <div className="text-center text-muted-foreground py-8 w-full">
                <Search className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg mb-2">{config.noResultsMessage}</p>
                <p className="text-sm">Try searching with different keywords</p>
              </div>
            )}

          {/* Empty state */}
          {eose && currentData.sorted.length === 0 && (
            <div className="text-center text-muted-foreground py-8 w-full">
              <Icon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg mb-2">{config.emptyMessage}</p>
              <p className="text-sm">
                Stations will appear here once they are added to the network.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
