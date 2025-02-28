import NDK, { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import NDKCacheAdapterDexie from "@nostr-dev-kit/ndk-cache-dexie";
import { defaultRelays } from "@wavefunc/common/src/constants/relays";

const LOCAL_MACHINE_IP = process.env.NEXT_PUBLIC_LOCAL_MACHINE_IP;
const WS_PROTOCOL =
  process.env.NEXT_PUBLIC_APP_ENV === "development" ? "ws" : "wss";
const REALY_PREFIX =
  process.env.NEXT_PUBLIC_APP_ENV === "development" ? "" : "relay.";
const PORT_OR_DEFAULT =
  process.env.NEXT_PUBLIC_APP_ENV === "development" ? ":3002" : "";
if (!LOCAL_MACHINE_IP) {
  throw new Error(
    "NEXT_PUBLIC_LOCAL_MACHINE_IP environment variable is required"
  );
}

const dexieAdapter = new NDKCacheAdapterDexie({ dbName: "wavefunc-ndk-cache" });

class NostrService {
  private static instance: NostrService;
  private ndk: NDK;

  private constructor() {
    const signer = NDKPrivateKeySigner.generate();
    this.ndk = new NDK({
      explicitRelayUrls: [
        `${WS_PROTOCOL}://${REALY_PREFIX}${LOCAL_MACHINE_IP}${PORT_OR_DEFAULT}`,
        ...defaultRelays,
        // 'wss://relay.damus.io',
        // 'wss://relay.nostr.band',
      ],
      signer,
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
}

export const nostrService = NostrService.getInstance();
