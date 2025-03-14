"use client";

import { Toaster } from "@/components/ui/toaster";
import { Provider, useAtom } from "jotai";
import { Metadata } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
import { stationDrawerAtom } from "./atoms/ui";
import { DevelopmentControls } from "./components/debug/DevelopmentControls";
import { EditStationDrawer } from "./components/EditStationDrawer";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { RadioPlayer } from "./components/RadioPlayer";
import "./globals.css";

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start-2p",
});

const inter = Inter({ subsets: ["latin"] });

function RootLayoutContent({ children }: { children: React.ReactNode }) {
  const [drawerState] = useAtom(stationDrawerAtom);

  return (
    <html lang="en">
      <body className={`${pressStart2P.variable} ${inter.className}`}>
        <div className="flex flex-col min-h-screen pb-24">
          <Header />
          <main className="grow container mx-auto px-4 py-8">
            {children}
            <Toaster />
          </main>
          <DevelopmentControls />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t">
            <RadioPlayer />
          </div>
        </div>
        <EditStationDrawer
          station={drawerState.station}
          isOpen={drawerState.isOpen}
        />
      </body>
    </html>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Provider>
      <RootLayoutContent>{children}</RootLayoutContent>
    </Provider>
  );
}
