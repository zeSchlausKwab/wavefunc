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
        search: { search: query },
      });
    };

    return (
      <>
        <FloatingHeader
          searchInput={searchInput}
          setSearchInput={setSearchInput}
          onSearch={handleSearch}
        />
        <div className="px-4 md:px-8 pt-28 md:pt-32 pb-36 md:pb-40 text-center relative z-0">
          <Outlet />
        </div>
        <FloatingPlayer />
      </>
    );
  },
});
