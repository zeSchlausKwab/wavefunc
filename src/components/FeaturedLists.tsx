import { useFeaturedLists } from "../lib/hooks/useFeaturedLists";
import { FavoriteListCard } from "./FavoriteListCard";
import { Sparkles } from "lucide-react";

/**
 * FeaturedLists component displays curated lists of stations
 * created by the application (signed with app pubkey).
 * These lists are displayed on the landing page.
 */
export function FeaturedLists() {
  const { featuredLists, isLoading, error, appPubkey } = useFeaturedLists();

  // Silently don't render if:
  // - There's an error
  // - No app pubkey is configured
  // - Still loading
  // - No featured lists exist
  if (error) {
    console.error("Error loading featured lists:", error);
    return null;
  }

  if (!appPubkey || isLoading || featuredLists.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6 mb-12">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-bold">Featured Collections</h2>
      </div>

      {/* Featured Lists */}
      <div className="space-y-8">
        {featuredLists.map((list) => (
          <FavoriteListCard
            key={list.favoritesId}
            list={list}
            isOwner={false} // Featured lists are owned by app, not the current user
            onDeleteList={undefined} // No delete action for featured lists
          />
        ))}
      </div>

      {/* Separator */}
      <div className="border-t border-gray-200 my-12"></div>
    </div>
  );
}
