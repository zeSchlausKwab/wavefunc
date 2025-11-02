import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Image } from "lucide-react";

interface CreateFavoritesListFormProps {
  onSubmit: (
    name: string,
    description: string,
    banner?: string
  ) => Promise<void>;
  onCancel: () => void;
}

export function CreateFavoritesListForm({
  onSubmit,
  onCancel,
}: CreateFavoritesListFormProps) {
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [newListBanner, setNewListBanner] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    await onSubmit(newListName, newListDescription, newListBanner || undefined);
    setNewListName("");
    setNewListDescription("");
    setNewListBanner("");
  };

  return (
    <div className="bg-muted/50 p-2 md:p-4 rounded-lg border">
      <h3 className="text-lg font-semibold mb-4">Create New Favorites List</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              List Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g., Jazz Favorites, Road Trip Mix"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
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
              value={newListDescription}
              onChange={(e) => setNewListDescription(e.target.value)}
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
                  value={newListBanner}
                  onChange={(e) => setNewListBanner(e.target.value)}
                />
              </div>
              {newListBanner && (
                <div className="rounded-lg overflow-hidden border h-32">
                  <img
                    src={newListBanner}
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
          <Button type="submit" disabled={!newListName.trim()}>
            Create List
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
