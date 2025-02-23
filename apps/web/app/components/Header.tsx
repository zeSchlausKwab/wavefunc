import { Button } from "@/components/ui/button";
import { LogOut, Plus } from "lucide-react";
import { Profile } from "./Profile";
import { useSetAtom } from "jotai";
import { openCreateStationDrawer } from "../atoms/ui";

// Placeholder data for the profile
const placeholderProfile = {
  name: "John Doe",
  email: "john@example.com",
  avatarUrl: "https://picsum.photos/seed/john/400/400",
};

export function Header() {
  const openCreateDrawer = useSetAtom(openCreateStationDrawer);

  return (
    <header className="flex justify-between items-center p-4">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold">WaveFunc</h1>
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="icon"
            className="bg-green-500 hover:bg-green-600 text-white"
            onClick={() => openCreateDrawer()}
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Profile {...placeholderProfile} />
          <Button variant="ghost" size="icon" aria-label="Logout">
            <LogOut className="h-5 w-5 text-primary" />
          </Button>
        </div>
      </div>
    </header>
  );
}
