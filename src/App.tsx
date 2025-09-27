import { FloatingHeader } from "./components/FloatingHeader";
import "./index.css";

import { PostView } from "./components/PostView";

export function App() {
  return (
    <>
      <FloatingHeader />
      <div className="container mx-auto p-8 pt-24 text-center relative z-10">
        <PostView />
      </div>
    </>
  );
}

export default App;
