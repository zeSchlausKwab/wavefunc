"use client";

import { Provider } from "jotai";
import { Inter, Press_Start_2P } from "next/font/google";
import { DevelopmentControls } from "./components/DevelopmentControls";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Nav } from "./components/Nav";
import { RadioPlayer } from "./components/RadioPlayer";
import "./globals.css";

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
            <Nav />
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
