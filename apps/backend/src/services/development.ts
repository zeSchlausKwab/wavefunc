import NDK, { NDKPrivateKeySigner, NostrEvent } from "@nostr-dev-kit/ndk";
import { defaultRelays } from "@wavefunc/common/src/constants/relays";
import { publishStation } from "@wavefunc/common/src/nostr/publish";
import {
  seedStationKeys,
  seedStations,
} from "@wavefunc/common/src/seed/stations";
import { Client } from "pg";
import dotenv from "dotenv";
import path from "path";

import WebSocket from "ws";
(global as any).WebSocket = WebSocket;

export class DevelopmentService {
  private ndk: NDK;

  constructor() {
    this.ndk = new NDK({
      explicitRelayUrls: defaultRelays,
      enableOutboxModel: false,
    });

    // Load environment variables
    dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
  }

  async seedData() {
    await this.ndk.connect();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const stationsByBroadcaster = seedStations.reduce(
        (acc, station) => {
          if (station.content.includes('"name":"FIP')) {
            acc.fip = [...(acc.fip || []), station];
          } else if (station.content.includes('"name":"iWayHigh"')) {
            acc.iwayhigh = [...(acc.iwayhigh || []), station];
          } else {
            acc.soma = [...(acc.soma || []), station];
          }
          return acc;
        },
        {} as Record<keyof typeof seedStationKeys, NostrEvent[]>
      );

      const stationEvents = await Promise.all(
        Object.entries(stationsByBroadcaster).flatMap(
          async ([broadcaster, stations]) => {
            const key =
              seedStationKeys[broadcaster as keyof typeof seedStationKeys];
            this.ndk.signer = new NDKPrivateKeySigner(key.nsec);

            return Promise.all(
              stations.map((station) => publishStation(this.ndk, station))
            );
          }
        )
      );

      console.log(`Published ${stationEvents.flat().length} stations`);
      return { message: "Database seeded successfully" };
    } catch (error) {
      console.error("Error seeding data:", error);
      throw new Error("Failed to seed data");
    }
  }

  async nukeData() {
    console.log("Nuking data");

    try {
      let connectionString = process.env.POSTGRES_CONNECTION_STRING;
      if (!connectionString) {
        throw new Error(
          "PostgreSQL connection string not found in environment variables"
        );
      }

      // When running locally, replace 'postgres' hostname with 'localhost'
      connectionString = connectionString.replace("@postgres:", "@localhost:");

      // Add sslmode=disable if not already present
      if (!connectionString.includes("sslmode=")) {
        connectionString +=
          connectionString.includes("?") ? "&sslmode=disable" : (
            "?sslmode=disable"
          );
      }

      console.log("Using database connection:", connectionString);

      const client = new Client({ connectionString });
      await client.connect();

      // Delete all data from the events table
      // Note: The table name might be different depending on the PostgreSQL schema
      // Adjust the table name if necessary
      await client.query("DELETE FROM event");
      console.log("All data deleted from event table");

      await client.end();
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
