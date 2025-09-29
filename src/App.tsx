import { FloatingHeader } from "./components/FloatingHeader";
import "./index.css";

import { registerEventClass } from "@nostr-dev-kit/ndk-hooks";
import { useEffect } from "react";
import { PostView } from "./components/PostView";
import { StationView } from "./components/StationView";
import NDKStation from "./lib/NDKStation";

export function App() {
  useEffect(() => {
    registerEventClass(NDKStation)
  }, []);
  return (
    <>
      <FloatingHeader />
      <div className="container mx-auto p-8 pt-24 text-center relative z-10">
        <StationView />
        <div className="mt-8">
          <PostView />
        </div>
      </div>
    </>
  );
}

export default App;
