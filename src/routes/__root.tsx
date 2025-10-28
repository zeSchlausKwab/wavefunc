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
        {/* TODO: probably too hacky */}
        <div className="m-2 pt-24 md:m-4 min-w-[90vw]">
          <Outlet />
        </div>
        <FloatingPlayer />
      </>
    );
  },
});
