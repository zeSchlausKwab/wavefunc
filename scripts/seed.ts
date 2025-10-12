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

// Use hardcoded values for seeding (similar to other seed scripts)
const APP_PRIVATE_KEY =
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

    // Create 2-3 favorites lists per user
    const numLists = faker.number.int({ min: 2, max: 3 });

    const listNames = [
      {
        name: "My Favorite Stations",
        desc: "My personal collection of favorite radio stations",
      },
      { name: "Chill Vibes", desc: "Stations for relaxing and unwinding" },
      {
        name: "Work Background",
        desc: "Perfect stations for working and focusing",
      },
      { name: "Discovery Mix", desc: "New stations I'm exploring" },
      { name: "Top Picks", desc: "The best of the best radio stations" },
    ];

    for (let listIndex = 0; listIndex < numLists; listIndex++) {
      try {
        const listInfo = faker.helpers.arrayElement(listNames);

        // Create favorites list
        const favoritesList = NDKWFFavorites.createDefault(
          ndk,
          listInfo.name,
          listInfo.desc
        );
        favoritesList.pubkey = pubkey;

        // Add 3-8 random stations to this list
        const numStations = faker.number.int({ min: 3, max: 8 });
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
        await favoritesList.publish();

        favoritesCount++;
        console.log(
          `  ✓ Created "${listInfo.name}" with ${selectedStations.length} stations`
        );
      } catch (error) {
        console.error(
          `  ✗ Failed to create favorites list for user ${userIndex}:`,
          error
        );
      }
    }
  }

  console.log(`\n✅ Successfully seeded ${favoritesCount} favorites lists!`);
  console.log("Seeding complete!");
  process.exit(0);
}

seedData().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
