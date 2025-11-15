import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { FloatingHeader } from "../components/FloatingHeader";
import { FloatingPlayer } from "../components/FloatingPlayer";
import { FloatingSearchButton } from "../components/FloatingSearchButton";
import { useState } from "react";
import { useMedia } from "react-use";

export const Route = createRootRoute({
  component: () => {
    const [searchInput, setSearchInput] = useState("");
    const navigate = useNavigate();
    const isMobile = useMedia("(max-width: 768px)");

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
        {isMobile && (
          <FloatingSearchButton
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            onSearch={handleSearch}
          />
        )}
        <div className="m-2 pb-24 md:m-4 md:pt-24 min-w-[90vw]">
          <Outlet />
        </div>
        <FloatingPlayer />
      </>
    );
  },
});
