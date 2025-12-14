import { createFileRoute } from "@tanstack/react-router";
import { MusicBrainzSearch } from "@/components/MusicBrainzSearch";
import { Search } from "lucide-react";

export const Route = createFileRoute("/musicbrainz")({
  component: MusicBrainzSearchPage,
});

function MusicBrainzSearchPage() {
  return (
    <div className="space-y-6 mb-22">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Search className="w-6 h-6" />
        <h1 className="text-2xl font-bold">MusicBrainz Search</h1>
      </div>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-900 dark:text-blue-200">
          Search the MusicBrainz database for detailed music metadata. Use the{" "}
          <strong>Songs (Advanced)</strong> mode for precise searches with multiple criteria.
        </p>
      </div>

      {/* Search Component */}
      <MusicBrainzSearch />
    </div>
  );
}
