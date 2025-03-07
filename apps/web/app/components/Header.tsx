"use client";

import { Button } from "@/components/ui/button";
import { LogOut, Plus, LogIn, Menu } from "lucide-react";
import { Profile } from "./Profile";
import { useSetAtom, useAtomValue } from "jotai";
import { openCreateStationDrawer } from "../atoms/ui";
import { authStateAtom, loginDialogAtom, logout } from "../atoms/auth";
import { LoginDialog } from "./auth/LoginDialog";
import { Nav } from "./Nav";
import Link from "next/link";
import { useState, useEffect } from "react";

export function Header() {
  const openCreateDrawer = useSetAtom(openCreateStationDrawer);
  const openLoginDialog = useSetAtom(loginDialogAtom);
  const doLogout = useSetAtom(logout);
  const authState = useAtomValue(authStateAtom);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  return (
    <header className="flex flex-col sm:flex-row items-center p-4 gap-4 bg-white shadow-md">
      <div className="flex items-center justify-between w-full sm:w-auto">
        <Link href="/" className="text-2xl font-bold font-press-start-2p">
          WaveFunc
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={() => setIsNavOpen(!isNavOpen)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>
      <div
        className={`${isNavOpen ? "block" : "hidden"} sm:block w-full sm:w-auto`}
      >
        <Nav />
      </div>
      <div className="flex items-center space-x-4 flex-1 justify-end">
        {authState.isAuthenticated ?
          <>
            <Button
              variant="outline"
              size="icon"
              className="bg-green-500 hover:bg-green-600 text-white"
              onClick={() => openCreateDrawer()}
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Profile pubkey={authState.user?.pubkey || ""} />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Logout"
              onClick={() => doLogout()}
            >
              <LogOut className="h-5 w-5 text-primary" />
            </Button>
          </>
        : <Button
            variant="outline"
            onClick={() => openLoginDialog(true)}
            className="flex items-center space-x-2"
          >
            <LogIn className="h-5 w-5" />
            <span>Login</span>
          </Button>
        }
      </div>
      <LoginDialog />
    </header>
  );
}
