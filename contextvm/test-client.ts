// Test script for ContextVM client
// Run with: bun run contextvm/test-client.ts

import { WavefuncMetadataServerClient } from "../src/ctxcn/WavefuncMetadataServerClient";

async function testMetadataClient() {
  console.log("🧪 Testing ContextVM Metadata Client\n");

  const client = new WavefuncMetadataServerClient();

  // Test 1: Extract stream metadata
  console.log("Test 1: Extract Stream Metadata");
  console.log("─".repeat(50));

  const testUrl = "http://s5-webradio.antenne.de/chillout";
  console.log(`Stream URL: ${testUrl}`);

  try {
    const { result: metadata } = await client.ExtractStreamMetadata(testUrl);
    console.log("✅ Metadata extracted:");
    console.log(JSON.stringify(metadata, null, 2));
  } catch (error: any) {
    console.error("❌ Failed:", error.message);
  }

  console.log("\n");

  // Test 2: Search MusicBrainz
  console.log("Test 2: MusicBrainz Search");
  console.log("─".repeat(50));

  console.log("Query: artist='Radiohead', track='Creep'");

  try {
    const { result: results } = await client.SearchRecordings("Creep", "Radiohead");

    console.log(`✅ Found ${results.length} results:`);
    results.slice(0, 2).forEach((result, i) => {
      console.log(`\n${i + 1}. ${result.title} by ${result.artist}`);
      console.log(`   MBID: ${result.id}`);
      console.log(`   Release: ${result.release || "N/A"}`);
      console.log(`   Score: ${result.score}`);
    });
  } catch (error: any) {
    console.error("❌ Failed:", error.message);
  }

  console.log("\n✨ Tests complete!");
  await client.disconnect();
  process.exit(0);
}

// Run tests
testMetadataClient();
