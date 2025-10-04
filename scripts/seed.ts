// seed.ts
import {
  devUser1,
  devUser2,
  devUser3,
  devUser4,
  devUser5,
} from "@/lib/fixtures";
import { hexToBytes } from "@noble/hashes/utils";
import NDK, { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { getPublicKey } from "nostr-tools/pure";
import {
  createStationEvent,
  generateStationData,
  stationOrganizations,
} from "./gen_station";
import { createUserProfileEvent, generateUserProfileData } from "./gen_user";

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

        // Create and publish station
        const success = await createStationEvent(signer, ndk, stationData);

        if (success) {
          successCount++;
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
  console.log("Seeding complete!");
  process.exit(0);
}

seedData().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
