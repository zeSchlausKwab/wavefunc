import { createFileRoute } from "@tanstack/react-router";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/favorites")({
  component: Favorites,
});

function Favorites() {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <Heart className="w-16 h-16 text-red-500" fill="currentColor" />
      <h1 className="text-3xl font-bold">Favorites</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Your favorite stations will appear here. Currently you have{" "}
      </p>
      <p className="text-sm text-muted-foreground">
        This page will be implemented soon!
      </p>
    </div>
  );
}
