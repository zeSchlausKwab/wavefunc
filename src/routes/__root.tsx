import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { FloatingHeader } from "../components/FloatingHeader";
import { FloatingPlayer } from "../components/FloatingPlayer";
import { useState } from "react";

export const Route = createRootRoute({
  component: () => {
    const [searchInput, setSearchInput] = useState("");
    const navigate = useNavigate();

    const handleSearch = (query: string) => {
      navigate({
        to: "/",
        search: query ? { search: query } : {},
      });
    };

    return (
      <>
        <FloatingHeader
          searchInput={searchInput}
          setSearchInput={setSearchInput}
          onSearch={handleSearch}
        />
        <div className="md:pt-14 pb-16 md:pb-[100px] min-h-screen overflow-x-clip">
          <div className="max-w-screen-2xl mx-auto px-4 md:px-8 py-6 min-h-[calc(100vh-7rem)]">
            <Outlet />
          </div>
        </div>
        <FloatingPlayer
          searchInput={searchInput}
          setSearchInput={setSearchInput}
          onSearch={handleSearch}
        />
      </>
    );
  },
});
