import { Trash2, Edit, MoreVertical } from "lucide-react";
import { useState } from "react";
import { useFavorites, useFavoriteStations } from "../lib/hooks/useFavorites";
import { RadioCard } from "./RadioCard";
import { Button } from "./ui/button";
import { NDKWFFavorites } from "../lib/NDKWFFavorites";
import { EditFavoritesListForm } from "./EditFavoritesListForm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useAutoAnimate } from "@formkit/auto-animate/react";

interface FavoriteListCardProps {
  list: NDKWFFavorites;
  isOwner: boolean;
  onDeleteList?: () => void;
}

export function FavoriteListCard({
  list,
  isOwner,
  onDeleteList,
}: FavoriteListCardProps) {
  const [animationParent] = useAutoAnimate();
  const { stations: listStations } = useFavoriteStations(list);
  const { removeFavorite } = useFavorites();
  const [isEditing, setIsEditing] = useState(false);

  const handleRemoveStation = async (station: any) => {
    if (isOwner) {
      await removeFavorite(station);
    }
  };

  const handleEditList = async (
    name: string,
    description: string,
    banner?: string
  ) => {
    list.name = name;
    list.description = description;
    if (banner) {
      list.banner = banner;
    }
    await list.sign();
    await list.publish();
    setIsEditing(false);
  };

  // Generate a gradient based on list name for banner
  const getBannerGradient = (name: string) => {
    const colors = [
      "from-purple-500 to-pink-500",
      "from-blue-500 to-cyan-500",
      "from-green-500 to-emerald-500",
      "from-orange-500 to-red-500",
      "from-indigo-500 to-purple-500",
      "from-rose-500 to-pink-500",
    ];
    const hash = name
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  if (isEditing) {
    return (
      <div className="border rounded-lg overflow-hidden bg-card shadow-md p-2 md:p-4">
        <EditFavoritesListForm
          list={list}
          onSubmit={handleEditList}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card shadow-md">
      {/* Banner with Title and Description - Made Bigger */}
      <div
        className={`bg-gradient-to-r ${
          list.banner ? "" : getBannerGradient(list.name || "")
        } p-10 text-white relative min-h-[240px] flex flex-col justify-end`}
        style={
          list.banner
            ? {
                backgroundImage: `url(${list.banner})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {/* Fade-off gradient overlay at bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />

        {/* List Actions Menu (top right) */}
        {isOwner && (
          <div className="absolute top-4 right-4 z-20">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit List
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDeleteList}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete List
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Content */}
        <div className="relative z-10">
          <h2 className="text-3xl font-bold mb-2 drop-shadow-lg">
            {list.name}
          </h2>
          {list.description && (
            <p className="text-white/95 text-base drop-shadow-md">
              {list.description}
            </p>
          )}
          <div className="mt-4 text-white/90 text-sm font-medium">
            {listStations.length} station{listStations.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Stations Grid */}
      <div className="p-2 md:p-6">
        {listStations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            This list is empty. Start adding stations!
          </div>
        ) : (
          <div
            ref={animationParent}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6"
          >
            {listStations.map((station) => (
              <div key={station.id} className="space-y-2">
                <RadioCard station={station} />
                {isOwner && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemoveStation(station)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove from list
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
