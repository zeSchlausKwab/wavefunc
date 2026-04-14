import { hexToBytes } from "@noble/hashes/utils.js";
import { getPublicKey } from "nostr-tools/pure";
import { getToken } from "nostr-tools/nip98";
import { finalizeEvent } from "nostr-tools/pure";

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

const apiUrl = VPS_HOST.startsWith("http")
  ? `${VPS_HOST}/api/reindex-search`
  : `https://${VPS_HOST}/api/reindex-search`;

console.log("🚀 Triggering remote search reindex...");
console.log(`   VPS: ${VPS_HOST}`);

async function triggerReindex() {
  try {
    const pubkey = getPublicKey(hexToBytes(APP_PRIVATE_KEY!));
    const body = {};

    console.log("\n🔐 Creating NIP-98 auth token...");
    console.log(`   URL: ${apiUrl}`);
    console.log(`   Method: POST`);
    console.log(`   Pubkey: ${pubkey}`);

    const token = await getToken(
      apiUrl,
      "POST",
      (event) => finalizeEvent(event, hexToBytes(APP_PRIVATE_KEY!)),
      true,
      body
    );

    console.log("\n📡 Sending request to VPS...\n");

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

    console.log("\n✅ Remote reindex completed!");
  } catch (error) {
    console.error("❌ Failed to trigger remote reindex:", error);
    process.exit(1);
  }
}

triggerReindex();
