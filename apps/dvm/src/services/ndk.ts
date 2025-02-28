import NDK, { NDKEvent, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { config } from "dotenv";
import { resolve } from "path";
import { defaultRelays } from "@wavefunc/common";
import WebSocket from "ws";
(global as any).WebSocket = WebSocket;

// TODO: Backend ndks can be extracted into a shared package
config({ path: resolve(__dirname, "../../../../.env") });

const PRIVATE_KEY = process.env.DVM_PRIVATE_KEY;
const LOCAL_MACHINE_IP = process.env.NEXT_PUBLIC_LOCAL_MACHINE_IP;
if (!PRIVATE_KEY) {
  throw new Error("DVM_PRIVATE_KEY environment variable is required");
}
if (!LOCAL_MACHINE_IP) {
  throw new Error(
    "NEXT_PUBLIC_LOCAL_MACHINE_IP environment variable is required"
  );
}

class DVMService {
  private static instance: DVMService;
  private ndk: NDK;

  private constructor() {
    const signer = new NDKPrivateKeySigner(PRIVATE_KEY);
    this.ndk = new NDK({
      explicitRelayUrls: [`ws://${LOCAL_MACHINE_IP}:3002`, ...defaultRelays],
      signer,
    });
  }

  public static getInstance(): DVMService {
    if (!DVMService.instance) {
      DVMService.instance = new DVMService();
    }
    return DVMService.instance;
  }

  public async connect(): Promise<void> {
    try {
      await this.ndk.connect();
    } catch (error) {
      console.error("Connection error:", error);
      throw error;
    }
  }

  public getNDK(): NDK {
    return this.ndk;
  }
}

export const dvmService = DVMService.getInstance();
