// MusicBrainz result types
// Re-export types from the centralized schema file for frontend use
// These match the backend types from contextvm/schemas.ts

export interface BaseMusicBrainzResult {
  id: string;
  score: number;
  tags?: string[];
}

export interface RecordingResult extends BaseMusicBrainzResult {
  type: "recording";
  title: string;
  artist: string;
  artistId?: string;
  release?: string;
  releaseDate?: string;
  duration?: number; // in milliseconds
}

export interface ArtistResult extends BaseMusicBrainzResult {
  type: "artist";
  name: string;
  sortName: string;
  country?: string;
  beginDate?: string;
  endDate?: string;
  type_?: string; // person, group, etc.
  disambiguation?: string;
}

export interface ReleaseResult extends BaseMusicBrainzResult {
  type: "release";
  title: string;
  artist: string;
  artistId?: string;
  date?: string;
  country?: string;
  trackCount?: number;
  status?: string; // official, promotion, bootleg, etc.
  barcode?: string;
}

export interface LabelResult extends BaseMusicBrainzResult {
  type: "label";
  name: string;
  sortName: string;
  country?: string;
  type_?: string; // imprint, production, etc.
  labelCode?: string;
  disambiguation?: string;
}

export type MusicBrainzResult =
  | RecordingResult
  | ArtistResult
  | ReleaseResult
  | LabelResult;

export interface MusicBrainzResultsProps {
  results: MusicBrainzResult[];
  loading?: boolean;
  error?: string | null;
}
