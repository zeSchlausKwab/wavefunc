import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Image } from "lucide-react";
import { NDKWFFavorites } from "../lib/NDKWFFavorites";

interface EditFavoritesListFormProps {
  list: NDKWFFavorites;
  onSubmit: (
    name: string,
    description: string,
    banner?: string
  ) => Promise<void>;
  onCancel: () => void;
}

export function EditFavoritesListForm({
  list,
  onSubmit,
  onCancel,
}: EditFavoritesListFormProps) {
  const [name, setName] = useState(list.name || "");
  const [description, setDescription] = useState(list.description || "");
  const [banner, setBanner] = useState(list.banner || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await onSubmit(name, description, banner || undefined);
    onCancel();
  };

  return (
    <div className="bg-muted/50 p-2 md:p-4 rounded-lg border">
      <h3 className="text-lg font-semibold mb-4">Edit Favorites List</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              List Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g., Jazz Favorites, Road Trip Mix"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Description
            </label>
            <Input
              type="text"
              placeholder="Describe what this list is for"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Banner Image URL
            </label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={banner}
                  onChange={(e) => setBanner(e.target.value)}
                />
              </div>
              {banner && (
                <div className="rounded-lg overflow-hidden border h-32">
                  <img
                    src={banner}
                    alt="Banner preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "";
                      e.currentTarget.alt = "Invalid image URL";
                      e.currentTarget.className =
                        "w-full h-full flex items-center justify-center bg-muted text-muted-foreground";
                    }}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Image className="w-3 h-3" />
                Optional: Add a banner image URL (1200x400 recommended)
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={!name.trim()}>
            Save Changes
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
