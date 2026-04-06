import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import type { ISigner } from "applesauce-signers";
import type { NDKSigner } from "@nostr-dev-kit/ndk";
import { getEventHash } from "nostr-tools";

function createUnsignedEvent(template: EventTemplate, pubkey: string) {
  return {
    kind: template.kind,
    content: template.content ?? "",
    tags: (template.tags ?? []).map((tag) => [...tag]),
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
    pubkey,
  };
}

export function createApplesauceSignerFromNDK(ndkSigner: NDKSigner): ISigner {
  const getPublicKey = async () => (await ndkSigner.user()).pubkey;

  const signEvent = async (template: EventTemplate): Promise<NostrEvent> => {
    const pubkey = await getPublicKey();
    const unsignedEvent = createUnsignedEvent(template, pubkey);
    const id = getEventHash(unsignedEvent);
    const sig = await ndkSigner.sign({ ...unsignedEvent, id, sig: "" } as any);

    return {
      ...unsignedEvent,
      id,
      sig,
    };
  };

  const signer: ISigner = {
    getPublicKey,
    signEvent,
  };

  if (typeof ndkSigner.encrypt === "function" && typeof ndkSigner.decrypt === "function") {
    signer.nip04 = {
      encrypt: (pubkey, plaintext) =>
        ndkSigner.encrypt({ pubkey } as any, plaintext, "nip04"),
      decrypt: (pubkey, ciphertext) =>
        ndkSigner.decrypt({ pubkey } as any, ciphertext, "nip04"),
    };

    signer.nip44 = {
      encrypt: (pubkey, plaintext) =>
        ndkSigner.encrypt({ pubkey } as any, plaintext, "nip44"),
      decrypt: (pubkey, ciphertext) =>
        ndkSigner.decrypt({ pubkey } as any, ciphertext, "nip44"),
    };
  }

  return signer;
}
