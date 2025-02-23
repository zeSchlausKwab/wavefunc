"use client";

import { Button } from "@/components/ui/button";
import { LogOut, Plus, LogIn } from "lucide-react";
import { Profile } from "./Profile";
import { useSetAtom, useAtomValue } from "jotai";
import { openCreateStationDrawer } from "../atoms/ui";
import { authStateAtom, loginDialogAtom, logout } from "../atoms/auth";
import { LoginDialog } from "./LoginDialog";

// Placeholder data for the profile
const placeholderProfile = {
  name: "John Doe",
  email: "john@example.com",
  avatarUrl: "https://picsum.photos/seed/john/400/400",
};

export function Header() {
  const openCreateDrawer = useSetAtom(openCreateStationDrawer);
  const openLoginDialog = useSetAtom(loginDialogAtom);
  const doLogout = useSetAtom(logout);
  const authState = useAtomValue(authStateAtom);

  return (
    <header className="flex justify-between items-center p-4">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold">WaveFunc</h1>
        <div className="flex items-center space-x-4">
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
      </div>
      <LoginDialog />
    </header>
  );
}
