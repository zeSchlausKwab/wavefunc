import type { RecordingResult } from "../types/musicbrainz";
import type { SongMetadataInput } from "./nostr/domain";

/**
 * Adapt a MusicBrainz recording into the canonical metadata shape used by the
 * song event, favourite, and installed-app media acquisition flows.
 */
export function recordingToSongMetadata(
  recording: RecordingResult,
): SongMetadataInput {
  return {
    song: recording.title,
    artist: recording.artist,
    musicBrainz: {
      id: recording.id,
      title: recording.title,
      artist: recording.artist,
      release: recording.release,
      releaseId: recording.releaseId,
      releaseDate: recording.releaseDate,
      duration: recording.duration,
      tags: recording.tags ? [...recording.tags] : undefined,
    },
  };
}
