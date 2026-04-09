// Station data generation for the seed script.
// Returns plain station input objects suitable for `buildStationTemplate`.

import { faker } from "@faker-js/faker";
import type { Stream, StationTemplateInput } from "../src/lib/nostr/domain";

export const stationOrganizations = [
  { name: "FIP Style",            genre: "jazz",       country: "FR", language: "fr", location: "Paris, France" },
  { name: "SomaFM Style",         genre: "electronic", country: "US", language: "en", location: "San Francisco, CA" },
  { name: "Jazz Network",         genre: "jazz",       country: "US", language: "en", location: "New York, NY" },
  { name: "Rock Central",         genre: "rock",       country: "US", language: "en", location: "Los Angeles, CA" },
  { name: "Electronic Collective",genre: "electronic", country: "DE", language: "de", location: "Berlin, Germany" },
  { name: "World Music Hub",      genre: "world",      country: "BR", language: "pt", location: "São Paulo, Brazil" },
  { name: "Classical Society",    genre: "classical",  country: "AT", language: "de", location: "Vienna, Austria" },
  { name: "Pop Network",          genre: "pop",        country: "GB", language: "en", location: "London, UK" },
] as const;

export type StationSeedData = StationTemplateInput & {
  /** Hex private key used to sign this station event. */
  organizationKey: string;
};

export function generateStationOrgKey(orgIndex: number): string {
  const baseKey = "1000000000000000000000000000000000000000000000000000000000000000";
  const orgKeyNum = BigInt(`0x${baseKey}`) + BigInt(orgIndex + 1);
  return orgKeyNum.toString(16).padStart(64, "0");
}

export function generateStationData(stationIndex: number, orgIndex: number): StationSeedData {
  faker.seed(stationIndex + 2000);

  const org = stationOrganizations[orgIndex % stationOrganizations.length]!;
  const stationName = generateStationName(org.genre);
  const description = generateStationDescription(org.genre);

  return {
    stationId: `station-${stationIndex.toString().padStart(3, "0")}`,
    name: stationName,
    description,
    thumbnail: faker.image.urlPicsumPhotos({ width: 400, height: 400 }),
    website: `https://${faker.internet.domainName()}`,
    location: org.location,
    countryCode: org.country,
    genres: generateGenres(org.genre),
    languages: [org.language],
    streams: generateStreams(stationName),
    organizationKey: generateStationOrgKey(orgIndex),
  };
}

function generateStationName(genre?: string): string {
  const genreNames: Record<string, readonly string[]> = {
    jazz:       ["Jazz Central", "Smooth Jazz", "Jazz Café", "Blue Note Radio", "Jazz Lounge"],
    rock:       ["Rock Station", "Classic Rock", "Alternative Rock", "Indie Rock", "Rock Central"],
    electronic: ["Electronic Beats", "Techno Station", "House Music", "EDM Radio", "Synth Wave"],
    classical:  ["Classical FM", "Symphony Radio", "Concert Hall", "Classical Music", "Orchestra Live"],
    pop:        ["Pop Hits", "Top 40", "Hit Radio", "Pop Central", "Chart Music"],
    world:      ["World Music", "Global Sounds", "International Radio", "Cultural Beats", "Ethnic Music"],
  };

  if (genre && genreNames[genre]) {
    return faker.helpers.arrayElement(genreNames[genre]!);
  }

  const prefix = faker.helpers.arrayElement(["Radio", "FM", "Station", "Wave", "Sound", "Beat", "Vibe"]);
  const suffix = faker.helpers.arrayElement(["FM", "Radio", "Live", "Stream", "Music", "Sound"]);
  return `${prefix} ${faker.word.adjective()} ${suffix}`;
}

function generateStationDescription(genre?: string): string {
  const genreDescriptions: Record<string, string> = {
    jazz:       "Smooth jazz, bebop, and contemporary jazz featuring legendary artists and **emerging** talents.",
    rock:       "Classic rock anthems, alternative hits, and *underground* rock from around the world.",
    electronic: "Electronic beats, techno rhythms, and **synthesized** soundscapes for the digital age.",
    classical:  "Timeless classical compositions from *baroque* to contemporary **orchestral** works.",
    pop:        "Today's biggest hits and *chart-toppers* from around the globe.",
    world:      "Traditional and contemporary music from **diverse** cultures and *global* communities.",
  };

  if (genre && genreDescriptions[genre]) {
    return genreDescriptions[genre]!;
  }

  return faker.helpers.arrayElement([
    "Broadcasting the finest music 24/7 with **exceptional** sound quality.",
    "Your favorite music destination featuring *curated* playlists and live shows.",
    "Discover new artists and classic favorites in our **diverse** music collection.",
    "Premium music streaming with *crystal clear* audio and no interruptions.",
    "The ultimate music experience featuring both **emerging** and *established* artists.",
  ]);
}

function generateGenres(primaryGenre?: string): string[] {
  const allGenres = ["jazz", "rock", "electronic", "classical", "pop", "world", "blues", "folk", "reggae", "hip-hop"];
  if (primaryGenre) {
    const additional = faker.helpers.arrayElements(
      allGenres.filter((g) => g !== primaryGenre),
      faker.number.int({ min: 0, max: 2 }),
    );
    return [primaryGenre, ...additional];
  }
  return faker.helpers.arrayElements(allGenres, faker.number.int({ min: 1, max: 3 }));
}

function generateStreams(stationName: string): Stream[] {
  const formats = ["audio/mpeg", "audio/aac", "audio/ogg"] as const;
  const codecs: Record<(typeof formats)[number], string> = {
    "audio/mpeg": "mp3",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
  };
  const bitrates = [128000, 192000, 256000, 320000];
  const sampleRates = [44100, 48000];

  const numStreams = faker.number.int({ min: 1, max: 3 });
  const streams: Stream[] = [];

  for (let i = 0; i < numStreams; i++) {
    const format = faker.helpers.arrayElement(formats);
    const bitrate = faker.helpers.arrayElement(bitrates);
    const sampleRate = faker.helpers.arrayElement(sampleRates);

    streams.push({
      url: `https://stream.${faker.internet.domainName()}/${stationName.toLowerCase().replace(/\s+/g, "-")}-${bitrate}`,
      format,
      quality: { bitrate, codec: codecs[format], sampleRate },
      primary: i === 0,
    });
  }

  return streams;
}
