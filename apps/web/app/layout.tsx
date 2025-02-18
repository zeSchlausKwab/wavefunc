"use client";

import { Press_Start_2P, Inter } from "next/font/google";
import "./globals.css";
import { Provider } from "jotai";
import { RadioPlayer } from "./components/RadioPlayer";
import { Profile } from "./components/Profile";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { DevelopmentControls } from "./components/DevelopmentControls";

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start-2p",
});

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${pressStart2P.variable} ${inter.className}`}>
        <Provider>
          <div className="flex flex-col min-h-screen">
            <Header />
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
              {children}
            </main>
            <DevelopmentControls />
            <Footer />
          </div>
          <div className="fixed bottom-0 left-0 right-0 z-50">
            <RadioPlayer />
          </div>
        </Provider>
      </body>
    </html>
  );
}
