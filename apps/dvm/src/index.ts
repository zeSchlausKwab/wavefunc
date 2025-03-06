import { DVMRequestSchema } from "@wavefunc/common";
import { NDKEvent, NDKFilter } from "@nostr-dev-kit/ndk";
import { dvmService } from "./services/ndk";
import { auddService } from "./services/audd";

const JOB_KIND = 5000;
const RESULT_KIND = 6000;

async function processRequest(event: NDKEvent): Promise<any> {
  try {
    // Parse the content as JSON and validate
    const content = JSON.parse(event.content);
    const result = DVMRequestSchema.safeParse(content);

    if (!result.success) {
      throw new Error("Invalid request format");
    }

    const request = result.data;

    console.log(request);

    // Handle different types of requests
    switch (request.type) {
      case "music_recognition":
        return await auddService.handleEvent(event);
      case "text-process":
        let output = request.input;

        // Process based on options
        if (request.options?.uppercase) {
          output = output.toUpperCase();
        }
        if (request.options?.reverse) {
          output = output.split("").reverse().join("");
        }

        return output;
    }
  } catch (error) {
    console.error("Error processing request:", error);
    throw error;
  }
}

async function handleEvent(event: NDKEvent) {
  try {
    const output = await processRequest(event);

    // Only create a response event if the output is not undefined
    // (AudD service handles its own responses)
    if (output !== undefined) {
      const responseEvent = new NDKEvent(dvmService.getNDK());
      responseEvent.kind = RESULT_KIND;
      responseEvent.tags = [
        ["e", event.id],
        ["p", event.pubkey],
      ];
      responseEvent.content = JSON.stringify({
        input: JSON.parse(event.content).input,
        output,
        processedAt: Date.now(),
      });

      await responseEvent.publish();
    }
  } catch (error) {
    console.error("Error handling event:", error);
  }
}

async function main() {
  try {
    await dvmService.connect();

    const filter: NDKFilter = {
      kinds: [JOB_KIND],
      since: Math.floor(Date.now() / 1000),
    };
    const sub = dvmService.getNDK().subscribe(filter, {
      closeOnEose: false,
    });

    sub.on("event", (event: NDKEvent) => {
      handleEvent(event);
    });

    console.log("DVM listening for requests...");
  } catch (error) {
    console.error("Failed to start DVM:", error);
    process.exit(1);
  }
}

main().catch(console.error);
