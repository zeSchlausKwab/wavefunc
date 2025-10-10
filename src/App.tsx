import { FloatingHeader } from "./components/FloatingHeader";
import { FloatingPlayer } from "./components/FloatingPlayer";
import "./index.css";

import { registerEventClass } from "@nostr-dev-kit/ndk-hooks";
import { useEffect, useState } from "react";
import { PostView } from "./components/PostView";
import { StationView } from "./components/StationView";
import { MusicBrainzSearch } from "./components/MusicBrainzSearch";
import NDKStation from "./lib/NDKStation";

export function App() {
  const [searchInput, setSearchInput] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");

  useEffect(() => {
    registerEventClass(NDKStation);
  }, []);

  const handleSearch = (query: string) => {
    setCommittedSearch(query);
  };

  return (
    <>
      <FloatingHeader
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        onSearch={handleSearch}
      />
      <div className="px-4 md:px-8 pt-28 md:pt-32 pb-36 md:pb-40 text-center relative z-0">
        <div className="mt-12">
          <MusicBrainzSearch />
        </div>
        <StationView searchQuery={committedSearch} />
        <div className="mt-8">
          <PostView />
        </div>
      </div>
      <FloatingPlayer />
    </>
  );
}

export default App;
