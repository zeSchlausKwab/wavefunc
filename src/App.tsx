import { FloatingHeader } from "./components/FloatingHeader";
import "./index.css";

import { registerEventClass } from "@nostr-dev-kit/ndk-hooks";
import { useEffect, useState } from "react";
import { PostView } from "./components/PostView";
import { StationView } from "./components/StationView";
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
      <div className="container mx-auto p-8 pt-24 text-center relative z-10">
        <StationView searchQuery={committedSearch} />
        <div className="mt-8">
          <PostView />
        </div>
      </div>
    </>
  );
}

export default App;
