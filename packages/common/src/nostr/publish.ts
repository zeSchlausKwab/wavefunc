import NDK, { NDKEvent, type NostrEvent } from "@nostr-dev-kit/ndk";
import { RADIO_EVENT_KINDS } from "./radio";

export async function publishStation(
  ndk: NDK,
  event: NostrEvent
): Promise<NDKEvent> {
  if (event.kind !== RADIO_EVENT_KINDS.STREAM) {
    throw new Error("Invalid event kind. Expected radio stream event.");
  }

  const ndkEvent = new NDKEvent(ndk, event);

  await ndkEvent.publish();

  return ndkEvent;
}

export async function publishStations(
  ndk: NDK,
  events: NostrEvent[]
): Promise<NDKEvent[]> {
  const publishPromises = events.map((event) => publishStation(ndk, event));
  return Promise.all(publishPromises);
}

export async function deleteStation(
  ndk: NDK,
  eventId: string
): Promise<NDKEvent> {
  const deleteEvent = new NDKEvent(ndk, {
    kind: 5,
    tags: [["e", eventId]],
    content: "Deleted radio station",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
  });

  await deleteEvent.publish();

  return deleteEvent;
}
