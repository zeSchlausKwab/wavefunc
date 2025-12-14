// seed.ts
import {
  devUser1,
  devUser2,
  devUser3,
  devUser4,
  devUser5,
} from "@/lib/fixtures";
import { NDKWFFavorites } from "@/lib/NDKWFFavorites";
import { hexToBytes } from "@noble/hashes/utils";
import NDK, { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { getPublicKey } from "nostr-tools/pure";
import {
  createStationEvent,
  generateStationData,
  stationOrganizations,
} from "./gen_station";
import { createUserProfileEvent, generateUserProfileData } from "./gen_user";
import { faker } from "@faker-js/faker";

// Use APP_PRIVATE_KEY from environment (same as the API uses)
const APP_PRIVATE_KEY =
  process.env.APP_PRIVATE_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000001";
const APP_PUBKEY = getPublicKey(hexToBytes(APP_PRIVATE_KEY));

const ndk = new NDK({ explicitRelayUrls: ["ws://localhost:3334"] });

const devUsers = [devUser1, devUser2, devUser3, devUser4, devUser5];

async function connectWithRetry(maxRetries = 5, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Connecting to relay (attempt ${i + 1}/${maxRetries})...`);
      await ndk.connect();
      console.log("✅ Connected to relay!");
      return;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(
          `Failed to connect to relay after ${maxRetries} attempts: ${error}`
        );
      }
      console.log(`⏳ Relay not ready, waiting ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function seedData() {
  await connectWithRetry();
  const userPubkeys: string[] = [];
  const stationAddresses: string[] = [];

  console.log("Starting user seeding...");

  // Create user profiles, products and shipping options for each user
  for (let i = 0; i < devUsers.length; i++) {
    const user = devUsers[i];
    const signer = new NDKPrivateKeySigner(user.sk);
    await signer.blockUntilReady();
    const pubkey = (await signer.user()).pubkey;
    userPubkeys.push(pubkey);

    // Create user profile with user index for more personalized data
    console.log(`Creating profile for user ${pubkey.substring(0, 8)}...`);
    const userProfile = generateUserProfileData(i);
    await createUserProfileEvent(signer, ndk, userProfile);
  }

  console.log("Starting station seeding...");

  let stationIndex = 0;
  let successCount = 0;

  // Generate stations for each organization type
  for (let orgIndex = 0; orgIndex < stationOrganizations.length; orgIndex++) {
    const org = stationOrganizations[orgIndex];

    // Generate 2-3 stations per organization
    const stationsPerOrg = orgIndex < 4 ? 3 : 2; // More stations for first 4 orgs

    for (let i = 0; i < stationsPerOrg; i++) {
      try {
        // Generate station data
        const stationData = generateStationData(stationIndex, orgIndex);

        // Create signer with organization key
        const signer = new NDKPrivateKeySigner(stationData.organizationKey);
        await signer.blockUntilReady();
        const orgPubkey = (await signer.user()).pubkey;

        // Create and publish station
        const success = await createStationEvent(signer, ndk, stationData);

        if (success) {
          successCount++;
          // Store station address for favorites lists
          stationAddresses.push(`31237:${orgPubkey}:${stationData.stationId}`);
        }

        stationIndex++;
      } catch (error) {
        console.error(
          `Failed to create station ${stationIndex} for ${org.name}:`,
          error
        );
        stationIndex++;
      }
    }
  }

  console.log(
    `Successfully seeded ${devUsers.length} users and ${successCount} radio stations!`
  );

  // Create favorites lists for each user
  console.log("\nStarting favorites lists seeding...");
  let favoritesCount = 0;

  for (let userIndex = 0; userIndex < devUsers.length; userIndex++) {
    const user = devUsers[userIndex];
    const signer = new NDKPrivateKeySigner(user.sk);
    await signer.blockUntilReady();
    const pubkey = (await signer.user()).pubkey;

    console.log(
      `Creating favorites lists for user ${pubkey.substring(0, 8)}...`
    );

    // Seed faker for consistent but varied results per user
    faker.seed(userIndex + 5000);

    // Create exactly 3 favorites lists per user
    const listConfigs = [
      {
        name: "My Favorite Stations",
        desc: "My personal collection of favorite radio stations",
        banner: "https://picsum.photos/seed/fav1/1200/400",
      },
      {
        name: "Chill Vibes",
        desc: "Stations for relaxing and unwinding",
        banner: "https://picsum.photos/seed/chill/1200/400",
      },
      {
        name: "Work Background",
        desc: "Perfect stations for working and focusing",
        banner: "https://picsum.photos/seed/work/1200/400",
      },
    ] as const;

    for (let listIndex = 0; listIndex < listConfigs.length; listIndex++) {
      try {
        const listInfo = listConfigs[listIndex]!;

        // Create favorites list
        const favoritesList = NDKWFFavorites.createDefault(
          ndk,
          listInfo.name,
          listInfo.desc
        );
        favoritesList.pubkey = pubkey;

        // Set banner image
        favoritesList.banner = listInfo.banner;

        // Add at least 5 random stations to this list
        const numStations = faker.number.int({ min: 5, max: 8 });
        const selectedStations = faker.helpers.arrayElements(
          stationAddresses,
          Math.min(numStations, stationAddresses.length)
        );

        for (const stationAddress of selectedStations) {
          favoritesList.addStation(stationAddress);
        }

        // Sign and publish
        ndk.signer = signer;
        await favoritesList.sign();
        const relays = await favoritesList.publish();

        favoritesCount++;
        console.log(
          `  ✓ Created "${listInfo.name}" with ${selectedStations.length} stations and banner (published to ${relays.size} relays)`
        );

        // Small delay to ensure relay processing
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(
          `  ✗ Failed to create favorites list for user ${userIndex}:`,
          error
        );
      }
    }
  }

  console.log(`\n✅ Successfully seeded ${favoritesCount} favorites lists!`);

  // Create featured lists signed by the app
  console.log("\nStarting featured lists seeding (app-signed)...");
  let featuredCount = 0;

  const appSigner = new NDKPrivateKeySigner(APP_PRIVATE_KEY);
  await appSigner.blockUntilReady();

  const featuredListsConfig = [
    {
      name: "Staff Picks",
      desc: "Our favorite stations handpicked by the Wavefunc team",
      banner: "https://picsum.photos/seed/staff/1200/400",
    },
    {
      name: "New & Noteworthy",
      desc: "Recently added stations worth checking out",
      banner: "https://picsum.photos/seed/new/1200/400",
    },
  ] as const;

  for (const listConfig of featuredListsConfig) {
    try {
      // Create featured list
      const featuredList = NDKWFFavorites.createDefault(
        ndk as any,
        listConfig.name,
        listConfig.desc
      );
      featuredList.pubkey = APP_PUBKEY;
      featuredList.banner = listConfig.banner;

      // Add 6-8 random stations to featured list
      const numStations = faker.number.int({ min: 6, max: 8 });
      const selectedStations = faker.helpers.arrayElements(
        stationAddresses,
        Math.min(numStations, stationAddresses.length)
      );

      for (const stationAddress of selectedStations) {
        featuredList.addStation(stationAddress);
      }

      // Sign and publish
      ndk.signer = appSigner;
      await featuredList.sign();
      const relays = await featuredList.publish();

      featuredCount++;
      console.log(
        `  ✓ Created featured list "${listConfig.name}" with ${selectedStations.length} stations (published to ${relays.size} relays)`
      );

      // Small delay to ensure relay processing
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(
        `  ✗ Failed to create featured list "${listConfig.name}":`,
        error
      );
    }
  }

  console.log(`\n✅ Successfully seeded ${featuredCount} featured lists!`);
  console.log("Seeding complete!");
  process.exit(0);
}

seedData().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
