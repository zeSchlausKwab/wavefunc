import { Radio, Music } from "lucide-react";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";

export type SearchMode = "stations" | "musicbrainz";

interface SearchModeToggleProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
}

export function SearchModeToggle({
  mode,
  onModeChange,
}: SearchModeToggleProps) {
  return (
    <ButtonGroup>
      <Button type="button" onClick={() => onModeChange("stations")}>
        <Radio className="w-4 h-4 mr-1" />
        Stations
      </Button>
      <Button type="button" onClick={() => onModeChange("musicbrainz")}>
        <Music className="w-4 h-4 mr-1" />
        Music
      </Button>
    </ButtonGroup>
  );
}
