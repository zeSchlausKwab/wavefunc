// Seed development data into the local relay using applesauce primitives.
// Publishes user profiles, radio stations, favorites lists, and admin
// featured-list references — no NDK required.

import { faker } from "@faker-js/faker";
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { ProfileBlueprint } from "applesauce-common/blueprints";
import { EventFactory } from "applesauce-core";
import { RelayPool } from "applesauce-relay";
import { PrivateKeySigner } from "applesauce-signers";
import { hexToBytes } from "@noble/hashes/utils.js";
import { getPublicKey } from "nostr-tools/pure";

import {
  buildAdminFeatureTemplate,
  buildFavoritesListTemplate,
  buildStationTemplate,
} from "../src/lib/nostr/domain";
import {
  devUser1,
  devUser2,
  devUser3,
  devUser4,
  devUser5,
} from "../src/lib/fixtures";
import { generateUserProfileData } from "./gen_user";
import {
  generateStationData,
  stationOrganizations,
} from "./gen_station";

// ─── Configuration ───────────────────────────────────────────────────────────

const RELAY_URL = "ws://localhost:3334";
const APP_PRIVATE_KEY =
  process.env.APP_PRIVATE_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000001";
const APP_PUBKEY = getPublicKey(hexToBytes(APP_PRIVATE_KEY));

const devUsers = [devUser1, devUser2, devUser3, devUser4, devUser5];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pool = new RelayPool();
pool.relay(RELAY_URL);

async function publish(event: NostrEvent): Promise<void> {
  await pool.publish([RELAY_URL], event);
}

async function signAndPublish(
  signer: PrivateKeySigner,
  template: EventTemplate,
): Promise<NostrEvent> {
  const factory = new EventFactory({ signer });
  // factory.build() applies common operations (created_at, strip stamps,
  // include replaceable d-tag) that the bare sign() pipeline doesn't.
  const draft = await factory.build(template);
  const event = await factory.sign(draft);
  await publish(event);
  return event;
}

async function waitForRelay(maxRetries = 10, delayMs = 500): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const relay = pool.relay(RELAY_URL);
      // Trigger a connection by subscribing to a no-op filter briefly
      await new Promise<void>((resolve, reject) => {
        const sub = relay
          .request({ kinds: [0], limit: 1 })
          .subscribe({
            next: () => {},
            complete: () => resolve(),
            error: (err) => reject(err),
          });
        setTimeout(() => {
          sub.unsubscribe();
          resolve();
        }, 1000);
      });
      console.log("✅ Relay reachable!");
      return;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(`Relay never came up: ${error}`);
      }
      console.log(`⏳ Relay not ready, retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// ─── Seed phases ─────────────────────────────────────────────────────────────

async function seedUserProfiles(): Promise<void> {
  console.log("\nStarting user seeding...");

  for (let i = 0; i < devUsers.length; i++) {
    const user = devUsers[i]!;
    const signer = PrivateKeySigner.fromKey(user.sk);
    const pubkey = await signer.getPublicKey();

    console.log(`Creating profile for user ${pubkey.substring(0, 8)}...`);
    const profile = generateUserProfileData(i);
    const factory = new EventFactory({ signer });
    const draft = await factory.create(ProfileBlueprint, profile);
    const event = await factory.sign(draft);
    await publish(event);
  }
}

async function seedStations(): Promise<string[]> {
  console.log("\nStarting station seeding...");

  const stationAddresses: string[] = [];
  let stationIndex = 0;
  let successCount = 0;

  for (let orgIndex = 0; orgIndex < stationOrganizations.length; orgIndex++) {
    const org = stationOrganizations[orgIndex]!;
    const stationsPerOrg = orgIndex < 4 ? 3 : 2;

    for (let i = 0; i < stationsPerOrg; i++) {
      try {
        const data = generateStationData(stationIndex, orgIndex);
        const signer = PrivateKeySigner.fromKey(data.organizationKey);
        const orgPubkey = await signer.getPublicKey();

        const template = buildStationTemplate(data);
        await signAndPublish(signer, template);

        stationAddresses.push(`31237:${orgPubkey}:${data.stationId}`);
        successCount++;
        console.log(`  ✓ Published station: ${data.name} (${data.stationId})`);
      } catch (error) {
        console.error(`  ✗ Failed to create station ${stationIndex} for ${org.name}:`, error);
      }
      stationIndex++;
    }
  }

  console.log(`✅ Seeded ${successCount} radio stations.`);
  return stationAddresses;
}

async function seedUserFavoritesLists(stationAddresses: string[]): Promise<string[]> {
  console.log("\nStarting favorites lists seeding...");

  const createdFavoritesAddresses: string[] = [];
  const listConfigs = [
    { name: "My Favorite Stations", desc: "My personal collection of favorite radio stations", banner: "https://picsum.photos/seed/fav1/1200/400" },
    { name: "Chill Vibes",          desc: "Stations for relaxing and unwinding",                banner: "https://picsum.photos/seed/chill/1200/400" },
    { name: "Work Background",      desc: "Perfect stations for working and focusing",          banner: "https://picsum.photos/seed/work/1200/400" },
  ] as const;

  let favoritesCount = 0;

  for (let userIndex = 0; userIndex < devUsers.length; userIndex++) {
    const user = devUsers[userIndex]!;
    const signer = PrivateKeySigner.fromKey(user.sk);
    const pubkey = await signer.getPublicKey();

    console.log(`Creating favorites lists for user ${pubkey.substring(0, 8)}...`);
    faker.seed(userIndex + 5000);

    for (const listInfo of listConfigs) {
      try {
        const numStations = faker.number.int({ min: 5, max: 8 });
        const selectedStations = faker.helpers.arrayElements(
          stationAddresses,
          Math.min(numStations, stationAddresses.length),
        );

        const template = buildFavoritesListTemplate({
          name: listInfo.name,
          description: listInfo.desc,
          banner: listInfo.banner,
          stationAddresses: selectedStations,
        });

        const event = await signAndPublish(signer, template);
        const dTag = event.tags.find((tag) => tag[0] === "d")?.[1];
        if (dTag) {
          createdFavoritesAddresses.push(`30078:${pubkey}:${dTag}`);
        }

        favoritesCount++;
        console.log(`  ✓ Created "${listInfo.name}" with ${selectedStations.length} stations`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`  ✗ Failed to create favorites list for user ${userIndex}:`, error);
      }
    }
  }

  console.log(`✅ Seeded ${favoritesCount} user favorites lists.`);
  return createdFavoritesAddresses;
}

async function seedAdminFeatures(favoritesAddresses: string[]): Promise<void> {
  console.log("\nStarting admin featured references seeding...");

  const adminSigner = PrivateKeySigner.fromKey(devUser1.sk);
  const refs = favoritesAddresses.slice(0, 6);

  const template = buildAdminFeatureTemplate({
    type: "lists",
    featureId: "wavefunc-dev-featured-lists",
    refs,
  });

  await signAndPublish(adminSigner, template);
  console.log(`✅ Seeded admin featured references (${refs.length} lists).`);
}

async function seedAppFeaturedLists(stationAddresses: string[]): Promise<void> {
  console.log("\nStarting featured lists seeding (app-signed)...");

  const appSigner = PrivateKeySigner.fromKey(APP_PRIVATE_KEY);
  const featuredListsConfig = [
    { name: "Staff Picks",       desc: "Our favorite stations handpicked by the Wavefunc team", banner: "https://picsum.photos/seed/staff/1200/400" },
    { name: "New & Noteworthy",  desc: "Recently added stations worth checking out",            banner: "https://picsum.photos/seed/new/1200/400" },
  ] as const;

  let featuredCount = 0;

  for (const listConfig of featuredListsConfig) {
    try {
      const numStations = faker.number.int({ min: 6, max: 8 });
      const selectedStations = faker.helpers.arrayElements(
        stationAddresses,
        Math.min(numStations, stationAddresses.length),
      );

      const template = buildFavoritesListTemplate({
        name: listConfig.name,
        description: listConfig.desc,
        banner: listConfig.banner,
        stationAddresses: selectedStations,
      });

      await signAndPublish(appSigner, template);
      featuredCount++;
      console.log(`  ✓ Created featured list "${listConfig.name}" with ${selectedStations.length} stations`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`  ✗ Failed to create featured list "${listConfig.name}":`, error);
    }
  }

  console.log(`✅ Seeded ${featuredCount} app-signed featured lists.`);
  console.log(`   App pubkey: ${APP_PUBKEY}`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function seedData() {
  await waitForRelay();

  await seedUserProfiles();
  const stationAddresses = await seedStations();
  const favoritesAddresses = await seedUserFavoritesLists(stationAddresses);
  await seedAdminFeatures(favoritesAddresses);
  await seedAppFeaturedLists(stationAddresses);

  console.log("\n🎉 Seeding complete!");
  process.exit(0);
}

seedData().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
