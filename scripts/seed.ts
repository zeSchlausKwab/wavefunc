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
import { createUserProfileEvent, generateUserProfileData } from "./gen_user";

const RELAY_URL = process.env.APP_RELAY_URL;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

if (!RELAY_URL) {
  console.error("Missing required environment variables");
  process.exit(1);
}

if (!APP_PRIVATE_KEY) {
  console.error(
    "APP_PRIVATE_KEY environment variable is required for seeding payment details"
  );
  console.error("Please set APP_PRIVATE_KEY in your .env file");
  process.exit(1);
}

// Derive the public key from the private key
const APP_PUBKEY = getPublicKey(hexToBytes(APP_PRIVATE_KEY));

const ndk = new NDK({ explicitRelayUrls: ["ws://localhost:10547"] });

const devUsers = [devUser1, devUser2, devUser3, devUser4, devUser5];

async function seedData() {
  console.log("Connecting to Nostr...");
  await ndk.connect();
  const userPubkeys: string[] = [];

  console.log("Starting seeding...");

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

  console.log("Seeding complete!");
  process.exit(0);
}

seedData().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
