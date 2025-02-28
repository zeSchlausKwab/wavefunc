"use client";

import { Provider } from "jotai";
import { Inter, Press_Start_2P } from "next/font/google";
import { DevelopmentControls } from "./components/debug/DevelopmentControls";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Nav } from "./components/Nav";
import { RadioPlayer } from "./components/RadioPlayer";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { EditStationDrawer } from "./components/EditStationDrawer";
import { useAtom, useSetAtom } from "jotai";
import { stationDrawerAtom, closeStationDrawer } from "./atoms/ui";
import { Station } from "@wavefunc/common";

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start-2p",
});

const inter = Inter({ subsets: ["latin"] });

function RootLayoutContent({ children }: { children: React.ReactNode }) {
  const [drawerState] = useAtom(stationDrawerAtom);
  const closeDrawer = useSetAtom(closeStationDrawer);

  const handleSaveStation = async (station: Partial<Station>) => {
    // TODO: Implement station creation/update logic
    console.log("Save station:", station);
    closeDrawer();
  };

  return (
    <html lang="en">
      <body className={`${pressStart2P.variable} ${inter.className}`}>
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="flex-grow container mx-auto px-4 py-8 mb-24">
            {children}
            <Toaster />
          </main>
          <DevelopmentControls />
          <Footer />
        </div>
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <RadioPlayer />
        </div>
        <EditStationDrawer
          station={drawerState.station}
          isOpen={drawerState.isOpen}
          onClose={closeDrawer}
          onSave={handleSaveStation}
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
