"use client";

import React, { useState } from "react";
import { Press_Start_2P, Inter } from "next/font/google";
import "./globals.css";
import { RadioPlayer } from "./components/RadioPlayer";
import { Profile } from "./components/Profile";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start-2p",
});

const inter = Inter({ subsets: ["latin"] });

// Placeholder data for the profile
const placeholderProfile = {
  name: "John Doe",
  email: "john@example.com",
  avatarUrl: "https://picsum.photos/seed/john/400/400",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentStation, setCurrentStation] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayPause = () => {
    if (currentStation) {
      setIsPlaying(!isPlaying);
    }
  };

  const handleSkipForward = () => {
    console.log("Skip forward");
  };

  const handleSkipBack = () => {
    console.log("Skip backward");
  };

  const handlePlayStation = (station: Station) => {
    setCurrentStation(station);
    setIsPlaying(true);
  };

  return (
    <html lang="en">
      <body className={`${pressStart2P.variable} ${inter.className}`}>
        <div className="flex flex-col min-h-screen">
          <header className="bg-white bg-opacity-80 shadow-md sticky top-0 z-10">
            <div className="container mx-auto px-4 py-4 flex justify-between items-center">
              <h1 className="text-xl font-bold text-primary font-press-start-2p">
                wavefunc
              </h1>
              <div className="flex items-center space-x-4">
                <Profile {...placeholderProfile} />
                <Button variant="ghost" size="icon" aria-label="Logout">
                  <LogOut className="h-5 w-5 text-primary" />
                </Button>
              </div>
            </div>
          </header>
          <nav className="bg-white bg-opacity-80">
            <div className="container mx-auto px-4 py-2">
              <ul className="flex space-x-4 text-xs font-press-start-2p">
                <li>
                  <a
                    href="/"
                    className="text-primary hover:text-primary-foreground transition-colors"
                  >
                    Home
                  </a>
                </li>
                <li>
                  <a
                    href="/favorites"
                    className="text-primary hover:text-primary-foreground transition-colors"
                  >
                    Favorites
                  </a>
                </li>
                <li>
                  <a
                    href="/add-station"
                    className="text-primary hover:text-primary-foreground transition-colors"
                  >
                    Add Station
                  </a>
                </li>
              </ul>
            </div>
          </nav>
          <main className="flex-grow container mx-auto px-4 py-8 mb-24">
            {React.cloneElement(children as React.ReactElement, {
              onPlayStation: handlePlayStation,
            })}
          </main>
          <footer className="bg-white bg-opacity-80 shadow-md">
            <div className="container mx-auto px-4 py-4 text-center text-muted-foreground text-xs font-press-start-2p">
              © 2025 wavefunc
            </div>
          </footer>
        </div>
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <RadioPlayer
            station={currentStation}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onSkipForward={handleSkipForward}
            onSkipBack={handleSkipBack}
          />
        </div>
      </body>
    </html>
  );
}
