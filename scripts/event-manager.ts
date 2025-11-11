#!/usr/bin/env bun
/**
 * Event Manager Utility
 *
 * A utility to query and delete Nostr events from relays.
 *
 * Usage:
 *   bun run scripts/event-manager.ts query --kind 30078 --author <pubkey>
 *   bun run scripts/event-manager.ts delete --ids <id1> <id2> ... [--relays <relay1> <relay2> ...]
 *   bun run scripts/event-manager.ts delete --kind 30078 --author <pubkey> [--confirm]
 */

import { execSync } from "child_process";

const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

// Default relays from frontend.tsx
const DEFAULT_RELAYS = [
  "ws://localhost:3334",
  "wss://relay.wavefunc.live",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.minibits.cash",
  "wss://relay.coinos.io/",
  "wss://relay.nostr.net",
  "wss://nwc.primal.net",
];

interface QueryOptions {
  kind?: string;
  author?: string;
  ids?: string[];
  limit?: number;
  relays?: string[];
}

interface DeleteOptions {
  ids?: string[];
  kind?: string;
  author?: string;
  relays?: string[];
  confirm?: boolean;
  reason?: string;
}

function parseArgs(): { command: string; options: any } {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];
  if (!command) {
    printUsage();
    process.exit(1);
  }

  const options: any = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg.startsWith("--")) {
      const key = arg.slice(2);

      if (key === "confirm") {
        options[key] = true;
        continue;
      }

      // Collect all values until next flag or end
      const values: string[] = [];
      while (i + 1 < args.length) {
        const nextArg = args[i + 1];
        if (!nextArg || nextArg.startsWith("--")) break;
        values.push(nextArg);
        i++;
      }

      if (values.length === 0 && key !== "confirm") {
        console.error(`❌ Flag --${key} requires a value`);
        process.exit(1);
      }

      // Keep arrays as arrays, single values as strings
      if (key === "ids" || key === "relays") {
        options[key] = values;
      } else {
        options[key] = values.length === 1 ? values[0] : values;
      }
    }
  }

  return { command, options };
}

function printUsage() {
  console.log(`
Event Manager Utility - Query and delete Nostr events

USAGE:
  Query events:
    bun run scripts/event-manager.ts query [OPTIONS]

  Delete events by IDs:
    bun run scripts/event-manager.ts delete --ids <id1> [id2 ...] [OPTIONS]

  Delete events by filter (requires --confirm):
    bun run scripts/event-manager.ts delete --kind <kind> --author <pubkey> --confirm [OPTIONS]

OPTIONS:
  --kind <kind>           Event kind to query/delete
  --author <pubkey>       Author pubkey to query/delete
  --ids <id1> [id2 ...]   Specific event IDs to delete
  --limit <number>        Limit number of results (default: 100)
  --relays <url1> [url2]  Specific relays to use (default: all frontend relays)
  --confirm               Required for bulk deletions by filter
  --reason <text>         Deletion reason (default: "Event deletion")

EXAMPLES:
  # Query kind 30078 events by app pubkey
  bun run scripts/event-manager.ts query --kind 30078 --author 210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2

  # Delete specific event IDs
  bun run scripts/event-manager.ts delete --ids abc123 def456

  # Delete specific events from specific relays
  bun run scripts/event-manager.ts delete --ids abc123 --relays wss://relay.wavefunc.live

  # Query and delete all kind 30078 events by app
  bun run scripts/event-manager.ts query --kind 30078 --author 210f...
  bun run scripts/event-manager.ts delete --kind 30078 --author 210f... --confirm
`);
}

function queryEvents(options: QueryOptions) {
  const relays =
    options.relays && options.relays.length > 0
      ? options.relays
      : DEFAULT_RELAYS;
  const limit = options.limit || 100;

  let nakArgs = ["req"];

  if (options.kind) {
    nakArgs.push("-k", options.kind);
  }

  if (options.author) {
    nakArgs.push("-a", options.author);
  }

  if (options.ids && options.ids.length > 0) {
    for (const id of options.ids) {
      nakArgs.push("-e", id);
    }
  }

  nakArgs.push("--limit", limit.toString());

  // Add relays
  for (const relay of relays) {
    nakArgs.push(relay);
  }

  console.log("🔍 Querying events...");
  console.log(`   Command: nak ${nakArgs.join(" ")}\n`);

  try {
    const result = execSync(`nak ${nakArgs.join(" ")}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Parse events from output
    const events = result
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((e) => e !== null);

    if (events.length === 0) {
      console.log("✓ No events found");
      return [];
    }

    console.log(`✓ Found ${events.length} event(s):\n`);

    for (const event of events) {
      console.log(`  📄 Event ID: ${event.id}`);
      console.log(`     Kind: ${event.kind}`);
      console.log(`     Author: ${event.pubkey}`);
      console.log(
        `     Created: ${new Date(event.created_at * 1000).toISOString()}`
      );

      if (event.tags) {
        const dTag = event.tags.find((t: string[]) => t[0] === "d");
        if (dTag) console.log(`     d-tag: ${dTag[1]}`);

        const nameTag = event.tags.find((t: string[]) => t[0] === "name");
        if (nameTag) console.log(`     Name: ${nameTag[1]}`);
      }

      if (event.content && event.content.length < 200) {
        console.log(`     Content: ${event.content}`);
      }
      console.log();
    }

    return events;
  } catch (error: any) {
    console.error("❌ Query failed:", error.message);
    return [];
  }
}

function deleteEvents(options: DeleteOptions) {
  if (!APP_PRIVATE_KEY) {
    console.error("❌ APP_PRIVATE_KEY environment variable is not set");
    console.error("   Set it in your .env file");
    process.exit(1);
  }

  const relays =
    options.relays && options.relays.length > 0
      ? options.relays
      : DEFAULT_RELAYS;
  const reason = options.reason || "Event deletion";

  let eventIds: string[] = [];

  // If IDs are provided directly, use them
  if (options.ids && options.ids.length > 0) {
    eventIds = options.ids;
  }
  // If kind/author filter is provided, query first
  else if (options.kind || options.author) {
    if (!options.confirm) {
      console.error("❌ Bulk deletion by filter requires --confirm flag");
      console.error("   First run a query to see what will be deleted:");
      console.error(
        `   bun run scripts/event-manager.ts query --kind ${
          options.kind || "?"
        } --author ${options.author || "?"}`
      );
      process.exit(1);
    }

    console.log("🔍 Querying events to delete...\n");
    const events = queryEvents({
      kind: options.kind,
      author: options.author,
      relays,
    });

    if (events.length === 0) {
      console.log("✓ No events to delete");
      return;
    }

    eventIds = events.map((e: any) => e.id);

    console.log(`\n⚠️  About to delete ${eventIds.length} event(s)`);
    console.log(
      "   Press Ctrl+C to cancel, or wait 3 seconds to continue...\n"
    );

    execSync("sleep 3");
  } else {
    console.error(
      "❌ Must provide either --ids or (--kind/--author with --confirm)"
    );
    process.exit(1);
  }

  if (eventIds.length === 0) {
    console.log("✓ No events to delete");
    return;
  }

  // Build nak delete command
  let nakArgs = ["event", "-k", "5"];

  for (const id of eventIds) {
    nakArgs.push("-e", id);
  }

  nakArgs.push("-c", reason);
  nakArgs.push("--sec", APP_PRIVATE_KEY);

  // Add relays
  for (const relay of relays) {
    nakArgs.push(relay);
  }

  console.log("🗑️  Deleting events...");
  console.log(
    `   Deleting ${eventIds.length} event(s) from ${relays.length} relay(s)\n`
  );

  try {
    const result = execSync(`nak ${nakArgs.join(" ")}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    console.log(result);
    console.log("\n✅ Deletion complete!");

    // Show summary
    const successMatches = result.match(/success/g);
    const failedMatches = result.match(/failed/g);

    if (successMatches || failedMatches) {
      console.log("\n📊 Summary:");
      if (successMatches)
        console.log(`   ✓ ${successMatches.length} successful`);
      if (failedMatches) console.log(`   ✗ ${failedMatches.length} failed`);
    }
  } catch (error: any) {
    console.error("❌ Deletion failed:", error.message);
    process.exit(1);
  }
}

// Main
function main() {
  const { command, options } = parseArgs();

  switch (command) {
    case "query":
      queryEvents(options);
      break;

    case "delete":
      deleteEvents(options);
      break;

    case "help":
    case "--help":
    case "-h":
      printUsage();
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
