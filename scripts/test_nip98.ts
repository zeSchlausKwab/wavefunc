// test_nip98.ts - Test NIP-98 authentication
import { hexToBytes } from "@noble/hashes/utils";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { getToken } from "nostr-tools/nip98";

const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;
if (!APP_PRIVATE_KEY) {
  console.error("❌ APP_PRIVATE_KEY required");
  process.exit(1);
}

const VPS_HOST = process.env.VPS_HOST || "wavefunc.live";
const apiUrl = `https://${VPS_HOST}/api/debug/nip98`;

async function test() {
  const pubkey = getPublicKey(hexToBytes(APP_PRIVATE_KEY!));

  console.log("🔐 Creating NIP-98 auth token:");
  console.log(`   URL: ${apiUrl}`);
  console.log(`   Pubkey: ${pubkey}`);

  const body = {};

  const token = await getToken(
    apiUrl,
    "POST",
    (event) => finalizeEvent(event, hexToBytes(APP_PRIVATE_KEY!)),
    true,  // Include "Nostr " scheme
    body   // Include payload hash
  );

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  console.log("\n📡 Response:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    console.error("\n❌ Authentication failed!");
    console.log("Check the VPS logs (ssh deploy@wavefunc.live 'pm2 logs') for details");
  } else {
    console.log("\n✅ Authentication successful!");
  }
}

test();
