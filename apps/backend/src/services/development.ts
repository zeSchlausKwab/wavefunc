import NDK, { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { publishStation } from "@wavefunc/common/src/nostr/publish";
import {
  seedStationKeys,
  seedStations,
} from "@wavefunc/common/src/seed/stations";
import { config } from "../config";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

import WebSocket from "ws";
(global as any).WebSocket = WebSocket;

export class DevelopmentService {
  private ndk: NDK;

  constructor() {
    this.ndk = new NDK({
      explicitRelayUrls: config.defaultRelays,
      enableOutboxModel: false,
    });
  }

  async seedData() {
    await this.ndk.connect();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const keys = Object.values(seedStationKeys);
      const stationEvents = await Promise.all(
        seedStations.map(async (station, index) => {
          this.ndk.signer = new NDKPrivateKeySigner(keys[index].nsec);
          return publishStation(this.ndk, station);
        })
      );
      console.log(`Published ${stationEvents.length} stations`);
      return { message: "Database seeded successfully" };
    } catch (error) {
      console.error("Error seeding data:", error);
      throw new Error("Failed to seed data");
    }
  }

  async nukeData() {
    console.log("Nuking data");

    try {
      const dbPath = path.resolve(__dirname, "../../../relay/nostr.db");
      console.log("Using database at:", dbPath);

      const db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
      });

      await db.run("DELETE FROM event");
      console.log("All data deleted from event table");

      await db.close();
      return { message: "Database nuked successfully" };
    } catch (error) {
      console.error("Error nuking data:", error);
      throw new Error("Failed to nuke data");
    }
  }

  async resetData() {
    console.log("Resetting data");
    await this.nukeData();
    await this.seedData();
    return { message: "Database reset successfully" };
  }
}

export const developmentService = new DevelopmentService();
