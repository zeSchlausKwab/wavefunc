// trigger_remote_migration.ts - Trigger migration on remote VPS
import { hexToBytes } from "@noble/hashes/utils";
import { getPublicKey } from "nostr-tools/pure";
import { getToken } from "nostr-tools/nip98";
import { finalizeEvent } from "nostr-tools/pure";

// Get configuration from environment
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;
if (!APP_PRIVATE_KEY) {
  console.error("❌ APP_PRIVATE_KEY environment variable is required");
  console.error("   Set it in your .env file");
  process.exit(1);
}

const VPS_HOST = process.env.VPS_HOST;
if (!VPS_HOST) {
  console.error("❌ VPS_HOST environment variable is required");
  console.error("   Set it in your .env file (e.g., VPS_HOST=wavefunc.live)");
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const countArg = args.find((arg) => !arg.startsWith("--"));
const relayArg = args.find((arg) => arg.startsWith("--relay="));
const resetFlag = args.find((arg) => arg === "--reset");

const count = countArg ? parseInt(countArg) : 500;
const relayUrl = relayArg ? relayArg.split("=")[1] : undefined;
const reset = !!resetFlag;

// Determine API URL (support both http and https)
const apiUrl = VPS_HOST.startsWith("http")
  ? `${VPS_HOST}/api/migrate`
  : `https://${VPS_HOST}/api/migrate`;

console.log("🚀 Triggering remote migration...");
console.log(`   VPS: ${VPS_HOST}`);
console.log(`   Count: ${count}`);
if (relayUrl) console.log(`   Relay: ${relayUrl}`);
if (reset) console.log(`   Reset: ⚠️  YES - Will reset relay before migration`);

async function triggerMigration() {
  try {
    const pubkey = getPublicKey(hexToBytes(APP_PRIVATE_KEY!));

    console.log("\n🔐 Creating NIP-98 auth token...");
    console.log(`   URL: ${apiUrl}`);
    console.log(`   Method: POST`);
    console.log(`   Pubkey: ${pubkey}`);

    // Prepare request body
    const body: any = { count };
    if (relayUrl) body.relayUrl = relayUrl;
    if (reset) body.reset = true;

    // Create NIP-98 auth token using nostr-tools
    const token = await getToken(
      apiUrl,
      "POST",
      (event) => finalizeEvent(event, hexToBytes(APP_PRIVATE_KEY!)),
      true, // Include "Nostr " scheme
      body // Include payload hash
    );

    console.log("\n📡 Sending request to VPS...\n");

    // Make request with NIP-98 auth
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ Request failed: ${response.status} ${response.statusText}`
      );
      console.error(errorText);
      process.exit(1);
    }

    // Stream the response
    const reader = response.body?.getReader();
    if (!reader) {
      console.error("❌ No response body");
      process.exit(1);
    }

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stdout.write(decoder.decode(value, { stream: true }));
    }

    console.log("\n✅ Remote migration completed!");
  } catch (error) {
    console.error("❌ Failed to trigger remote migration:", error);
    process.exit(1);
  }
}

// Run the migration trigger
triggerMigration();
