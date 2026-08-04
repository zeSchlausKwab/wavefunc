import type { NostrEvent } from "applesauce-core/helpers/event";
import {
  buildSongAudioUpdateTemplate,
  buildSongTemplateFromMetadata,
  parseSongEvent,
  type ParsedSong,
  type SongMetadataInput,
} from "./domain";
import type { EventTemplate } from "./types";

type UploadedMedia = {
  url: string;
};

type ForgeAndFavoriteSongInput = {
  song?: ParsedSong;
  metadata?: SongMetadataInput;
  videoId: string;
  favorite: (address: string) => Promise<unknown>;
  acquireMedia: () => Promise<UploadedMedia>;
  publish: (template: EventTemplate) => Promise<NostrEvent>;
};

/**
 * Persist a song in the user's crate before starting its media transfer, then
 * update that same addressable song event with the uploaded Blossom URL.
 */
export async function forgeAndFavoriteSong(
  input: ForgeAndFavoriteSongInput,
): Promise<ParsedSong> {
  let persistedSong = input.song;
  if (!persistedSong) {
    if (!input.metadata) {
      throw new Error("Track metadata disappeared before the download started.");
    }
    const event = await input.publish(
      buildSongTemplateFromMetadata(input.metadata),
    );
    persistedSong = parseSongEvent(event);
  }

  if (!persistedSong.address) {
    throw new Error("The song has no canonical address to add to the crate.");
  }

  await input.favorite(persistedSong.address);
  const uploaded = await input.acquireMedia();
  const updatedEvent = await input.publish(
    buildSongAudioUpdateTemplate(
      persistedSong.event,
      uploaded.url,
      input.videoId,
    ),
  );

  return parseSongEvent(updatedEvent);
}
