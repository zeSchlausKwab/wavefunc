import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { Profile } from "./Profile";

// Placeholder data for the profile
const placeholderProfile = {
  name: "John Doe",
  email: "john@example.com",
  avatarUrl: "https://picsum.photos/seed/john/400/400",
};

export function Header() {
  return (
    <header className="flex justify-between items-center p-4">
      <div className="container mx-auto">
        <h1 className="text-2xl font-bold">WaveFunc</h1>
      </div>
      <div className="flex items-center space-x-4">
        <Profile {...placeholderProfile} />
        <Button variant="ghost" size="icon" aria-label="Logout">
          <LogOut className="h-5 w-5 text-primary" />
        </Button>
      </div>
    </header>
  );
}
