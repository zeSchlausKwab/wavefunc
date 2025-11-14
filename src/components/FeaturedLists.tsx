import { useFeaturedLists } from "../lib/hooks/useFeaturedLists";
import { FavoriteListCard } from "./FavoriteListCard";
import { Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";

/**
 * FeaturedLists component displays curated lists of stations
 * created by the application (signed with app pubkey).
 * These lists are displayed on the landing page.
 */
export function FeaturedLists() {
  const { featuredLists, isLoading, error, appPubkey } = useFeaturedLists();
  const [animationParent] = useAutoAnimate();

  useEffect(() => {
    if (featuredLists.length > 0) {
      console.log(
        `[FeaturedLists] Found ${featuredLists.length} featured list(s):`,
        featuredLists
      );
    }
  }, [featuredLists]);

  if (!appPubkey && !isLoading) {
    console.warn("[FeaturedLists] No app pubkey configured");
    return null;
  }

  const stillLoading = isLoading;

  return (
    <div className="space-y-6 mb-12">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-bold">Featured Collections</h2>
      </div>

      {/* Loading State */}
      {stillLoading && (
        <div className="text-center text-muted-foreground py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-2"></div>
          <p>Loading featured collections...</p>
        </div>
      )}

      {/* Error State */}
      {error && !stillLoading && (
        <div className="text-center text-red-600 py-8">
          <p className="text-lg mb-2">Failed to load featured collections</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Featured Lists */}
      {!stillLoading && !error && featuredLists.length > 0 && (
        <div ref={animationParent} className="space-y-8">
          {featuredLists.map((list) => (
            <FavoriteListCard
              key={list.favoritesId}
              list={list}
              isOwner={false} // Featured lists are owned by app, not the current user
              onDeleteList={undefined} // No delete action for featured lists
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!stillLoading && !error && featuredLists.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-lg">No featured collections available yet</p>
        </div>
      )}

      {/* Separator */}
      <div className="border-t border-gray-200 my-12"></div>
    </div>
  );
}
