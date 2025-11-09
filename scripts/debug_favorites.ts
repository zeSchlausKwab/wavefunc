#!/usr/bin/env bun
/**
 * Debug script to list all favorites lists in the relay
 */

import NDK from "@nostr-dev-kit/ndk";
import type { NDKFilter } from "@nostr-dev-kit/ndk";

const relayUrl = process.env.RELAY_URL || "ws://localhost:3334";

async function debugFavorites() {
  console.log("\n🔍 Debugging Favorites Lists");
  console.log("============================");
  console.log(`Relay: ${relayUrl}\n`);

  const ndk = new NDK({
    explicitRelayUrls: [relayUrl],
  });

  console.log("🔌 Connecting to relay...");
  await ndk.connect();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log("✅ Connected\n");

  // Query ALL favorites lists
  const filter: NDKFilter = {
    kinds: [30078],
  };

  console.log("📡 Fetching all favorites lists...\n");
  const events = await ndk.fetchEvents(filter);

  if (events.size === 0) {
    console.log("❌ No favorites lists found in relay!");
    process.exit(0);
  }

  console.log(`Found ${events.size} favorites list(s):\n`);

  Array.from(events).forEach((event, index) => {
    const name = event.tagValue("name") || "Untitled";
    const dTag = event.tagValue("d") || "";
    const lTag = event.tagValue("l") || "(no label)";
    const stationTags = event.tags.filter(
      (tag) => tag[0] === "a" && tag[1]?.startsWith("31237:")
    );

    console.log(`${index + 1}. ${name}`);
    console.log(`   Pubkey: ${event.pubkey}`);
    console.log(`   Kind: ${event.kind}`);
    console.log(`   Label (l tag): ${lTag}`);
    console.log(`   ID (d tag): ${dTag}`);
    console.log(`   Stations: ${stationTags.length}`);
    console.log(
      `   Created: ${new Date(event.created_at! * 1000).toLocaleString()}`
    );
    console.log("");
  });

  // Group by pubkey
  const byPubkey = new Map<string, number>();
  Array.from(events).forEach((event) => {
    const count = byPubkey.get(event.pubkey) || 0;
    byPubkey.set(event.pubkey, count + 1);
  });

  console.log("📊 Lists by Pubkey:");
  byPubkey.forEach((count, pubkey) => {
    console.log(`   ${pubkey.substring(0, 16)}...: ${count} list(s)`);
  });

  process.exit(0);
}

debugFavorites().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
