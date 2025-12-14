// show_app_pubkey.ts - Display the pubkey for APP_PRIVATE_KEY
import { getPublicKey } from "nostr-tools/pure";
import { hexToBytes } from "@noble/hashes/utils";

const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

if (!APP_PRIVATE_KEY) {
  console.error("❌ APP_PRIVATE_KEY environment variable is not set");
  console.error("   Set it in your .env file");
  process.exit(1);
}

try {
  const pubkey = getPublicKey(hexToBytes(APP_PRIVATE_KEY));

  console.log("\n📋 Application Key Information");
  console.log("================================");
  console.log(`Private Key: ${APP_PRIVATE_KEY}`);
  console.log(`Public Key:  ${pubkey}`);
  console.log("\n⚠️  Make sure this APP_PRIVATE_KEY is set on your VPS in .env.production");
  console.log("   The VPS needs this to verify NIP-98 authentication requests.\n");
} catch (error) {
  console.error("❌ Invalid APP_PRIVATE_KEY:", error);
  process.exit(1);
}
