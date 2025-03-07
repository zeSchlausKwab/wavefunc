import NDK, { NDKSigner } from "@nostr-dev-kit/ndk";
import NDKCacheAdapterDexie from "@nostr-dev-kit/ndk-cache-dexie";

const LOCAL_MACHINE_IP = process.env.NEXT_PUBLIC_HOST;
const WS_PROTOCOL =
  process.env.NEXT_PUBLIC_APP_ENV === "development" ? "ws" : "wss";
const REALY_PREFIX =
  process.env.NEXT_PUBLIC_APP_ENV === "development" ? "" : "relay.";
const PORT_OR_DEFAULT =
  process.env.NEXT_PUBLIC_APP_ENV === "development" ? ":3002" : "";
if (!LOCAL_MACHINE_IP) {
  throw new Error("HOST environment variable is required");
}

const dexieAdapter = new NDKCacheAdapterDexie({ dbName: "wavefunc-ndk-cache" });

class NostrService {
  private static instance: NostrService;
  private ndk: NDK;

  private constructor() {
    this.ndk = new NDK({
      explicitRelayUrls: [
        `${WS_PROTOCOL}://${REALY_PREFIX}${LOCAL_MACHINE_IP}${PORT_OR_DEFAULT}`,
      ],
      cacheAdapter: dexieAdapter,
    });
  }

  public static getInstance(): NostrService {
    if (!NostrService.instance) {
      NostrService.instance = new NostrService();
    }
    return NostrService.instance;
  }

  public async connect(): Promise<void> {
    await this.ndk.connect();
  }

  public getNDK(): NDK {
    return this.ndk;
  }

  public setSigner(signer: NDKSigner | null): void {
    this.ndk.signer = signer || undefined;
  }
}

export const nostrService = NostrService.getInstance();
