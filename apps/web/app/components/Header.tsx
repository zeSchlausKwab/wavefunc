"use client";

import { Button } from "@/components/ui/button";
import { LogOut, Plus, LogIn } from "lucide-react";
import { Profile } from "./Profile";
import { useSetAtom, useAtomValue } from "jotai";
import { openCreateStationDrawer } from "../atoms/ui";
import { authStateAtom, loginDialogAtom, logout } from "../atoms/auth";
import { LoginDialog } from "./auth/LoginDialog";
import { Nav } from "./Nav";
import Link from "next/link";
export function Header() {
  const openCreateDrawer = useSetAtom(openCreateStationDrawer);
  const openLoginDialog = useSetAtom(loginDialogAtom);
  const doLogout = useSetAtom(logout);
  const authState = useAtomValue(authStateAtom);

  return (
    <header className="flex flex-row items-center p-4 gap-4 bg-white shadow-md">
      <Link href="/" className="text-2xl font-bold font-press-start-2p">
        WaveFunc
      </Link>
      <Nav />
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
