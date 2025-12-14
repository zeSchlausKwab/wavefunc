import NDKStation, { type ClientTag, type Stream } from "@/lib/NDKStation";
import { faker } from "@faker-js/faker";
import { hexToBytes } from "@noble/hashes/utils";
import NDK, { type NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { getPublicKey } from "nostr-tools/pure";

/**
 * Station organization data for different types of stations
 */
export const stationOrganizations = [
  {
    name: "FIP Style",
    genre: "jazz",
    country: "FR",
    language: "fr",
    location: "Paris, France",
  },
  {
    name: "SomaFM Style",
    genre: "electronic",
    country: "US",
    language: "en",
    location: "San Francisco, CA",
  },
  {
    name: "Jazz Network",
    genre: "jazz",
    country: "US",
    language: "en",
    location: "New York, NY",
  },
  {
    name: "Rock Central",
    genre: "rock",
    country: "US",
    language: "en",
    location: "Los Angeles, CA",
  },
  {
    name: "Electronic Collective",
    genre: "electronic",
    country: "DE",
    language: "de",
    location: "Berlin, Germany",
  },
  {
    name: "World Music Hub",
    genre: "world",
    country: "BR",
    language: "pt",
    location: "São Paulo, Brazil",
  },
  {
    name: "Classical Society",
    genre: "classical",
    country: "AT",
    language: "de",
    location: "Vienna, Austria",
  },
  {
    name: "Pop Network",
    genre: "pop",
    country: "GB",
    language: "en",
    location: "London, UK",
  },
] as const;

/**
 * Generate station organization keys dynamically
 */
export function generateStationOrgKey(orgIndex: number): string {
  // Generate a deterministic but unique key for each organization
  const baseKey =
    "1000000000000000000000000000000000000000000000000000000000000000";
  const orgKeyNum = BigInt(`0x${baseKey}`) + BigInt(orgIndex + 1);
  return orgKeyNum.toString(16).padStart(64, "0");
}

/**
 * Generates random station data, optionally with station index for consistent stations
 * @param stationIndex Station index to create a consistent station across runs
 * @param orgIndex Organization index to determine station type and characteristics
 * @returns Station configuration data
 */
export function generateStationData(stationIndex: number, orgIndex: number) {
  // Use seed for consistent generation
  faker.seed(stationIndex + 2000); // Different offset from users

  const org = stationOrganizations[orgIndex % stationOrganizations.length]!;

  // Generate station metadata
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

/**
 * Generate realistic station names based on genre
 */
function generateStationName(genre?: string): string {
  const prefixes = ["Radio", "FM", "Station", "Wave", "Sound", "Beat", "Vibe"];
  const suffixes = ["FM", "Radio", "Live", "Stream", "Music", "Sound"];

  if (genre) {
    const genreNames = {
      jazz: [
        "Jazz Central",
        "Smooth Jazz",
        "Jazz Café",
        "Blue Note Radio",
        "Jazz Lounge",
      ],
      rock: [
        "Rock Station",
        "Classic Rock",
        "Alternative Rock",
        "Indie Rock",
        "Rock Central",
      ],
      electronic: [
        "Electronic Beats",
        "Techno Station",
        "House Music",
        "EDM Radio",
        "Synth Wave",
      ],
      classical: [
        "Classical FM",
        "Symphony Radio",
        "Concert Hall",
        "Classical Music",
        "Orchestra Live",
      ],
      pop: ["Pop Hits", "Top 40", "Hit Radio", "Pop Central", "Chart Music"],
      world: [
        "World Music",
        "Global Sounds",
        "International Radio",
        "Cultural Beats",
        "Ethnic Music",
      ],
    };

    const genreSpecific = genreNames[genre as keyof typeof genreNames];
    if (genreSpecific) {
      return faker.helpers.arrayElement(genreSpecific);
    }
  }

  const prefix = faker.helpers.arrayElement(prefixes);
  const suffix = faker.helpers.arrayElement(suffixes);
  const middle = faker.word.adjective();

  return `${prefix} ${middle} ${suffix}`;
}

/**
 * Generate realistic station descriptions
 */
function generateStationDescription(genre?: string): string {
  const baseDescriptions = [
    "Broadcasting the finest music 24/7 with **exceptional** sound quality.",
    "Your favorite music destination featuring *curated* playlists and live shows.",
    "Discover new artists and classic favorites in our **diverse** music collection.",
    "Premium music streaming with *crystal clear* audio and no interruptions.",
    "The ultimate music experience featuring both **emerging** and *established* artists.",
  ];

  const genreDescriptions = {
    jazz: "Smooth jazz, bebop, and contemporary jazz featuring legendary artists and **emerging** talents.",
    rock: "Classic rock anthems, alternative hits, and *underground* rock from around the world.",
    electronic:
      "Electronic beats, techno rhythms, and **synthesized** soundscapes for the digital age.",
    classical:
      "Timeless classical compositions from *baroque* to contemporary **orchestral** works.",
    pop: "Today's biggest hits and *chart-toppers* from around the globe.",
    world:
      "Traditional and contemporary music from **diverse** cultures and *global* communities.",
  };

  if (genre && genreDescriptions[genre as keyof typeof genreDescriptions]) {
    return genreDescriptions[genre as keyof typeof genreDescriptions];
  }

  return faker.helpers.arrayElement(baseDescriptions);
}

/**
 * Generate genres for a station
 */
function generateGenres(primaryGenre?: string): string[] {
  const allGenres = [
    "jazz",
    "rock",
    "electronic",
    "classical",
    "pop",
    "world",
    "blues",
    "folk",
    "reggae",
    "hip-hop",
  ];

  if (primaryGenre) {
    const additionalGenres = faker.helpers.arrayElements(
      allGenres.filter((g) => g !== primaryGenre),
      faker.number.int({ min: 0, max: 2 })
    );
    return [primaryGenre, ...additionalGenres];
  }

  return faker.helpers.arrayElements(
    allGenres,
    faker.number.int({ min: 1, max: 3 })
  );
}

/**
 * Generate realistic streams for a station
 */
function generateStreams(stationName: string): Stream[] {
  const formats = ["audio/mpeg", "audio/aac", "audio/ogg"];
  const codecs = {
    "audio/mpeg": "mp3",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
  };
  const bitrates = [128000, 192000, 256000, 320000];
  const sampleRates = [44100, 48000];

  const streams: Stream[] = [];
  const numStreams = faker.number.int({ min: 1, max: 3 });

  for (let i = 0; i < numStreams; i++) {
    const format = faker.helpers.arrayElement(formats);
    const bitrate = faker.helpers.arrayElement(bitrates);
    const sampleRate = faker.helpers.arrayElement(sampleRates);

    streams.push({
      url: `https://stream.${faker.internet.domainName()}/${stationName
        .toLowerCase()
        .replace(/\s+/g, "-")}-${bitrate}`,
      format,
      quality: {
        bitrate,
        codec: codecs[format as keyof typeof codecs],
        sampleRate,
      },
      primary: i === 0, // First stream is primary
    });
  }

  return streams;
}

/**
 * Create client tag for stations
 */
function createClientTag(): ClientTag {
  // Use a deterministic app key for client tags
  const APP_PRIVATE_KEY =
    "0000000000000000000000000000000000000000000000000000000000000001";
  const APP_PUBKEY = getPublicKey(hexToBytes(APP_PRIVATE_KEY));

  return {
    name: "NostrRadio",
    handlerReference: `31990:${APP_PUBKEY}:seedhandler123`,
    relayUrl: "wss://relay.wavefunc.live",
  };
}

/**
 * Creates and publishes a station event
 * @param signer NDK signer with the organization's private key
 * @param ndk NDK instance connected to a relay
 * @param stationData Station data to publish
 * @returns Boolean indicating success or failure
 */
export async function createStationEvent(
  signer: NDKPrivateKeySigner,
  ndk: NDK,
  stationData: ReturnType<typeof generateStationData>
): Promise<boolean> {
  try {
    // Create station instance
    const station = new NDKStation(ndk);

    // Set station properties
    station.stationId = stationData.stationId;
    station.name = stationData.name;
    station.description = stationData.description;
    station.thumbnail = stationData.thumbnail;
    station.website = stationData.website;
    station.location = stationData.location;
    station.countryCode = stationData.countryCode;

    // Set genres and languages
    station.setGenres(stationData.genres);
    station.setLanguages(stationData.languages);

    // Set streams
    station.setStreams(stationData.streams);

    // Set client tag
    station.setClient(createClientTag());

    // Set up station for publishing
    await signer.blockUntilReady();
    station.ndk = ndk;
    station.pubkey = (await signer.user()).pubkey;
    ndk.signer = signer;

    // Publish the station
    await station.publish();

    console.log(
      `Published station: ${stationData.name} (${stationData.stationId})`
    );
    return true;
  } catch (error) {
    console.error(`Failed to publish station ${stationData.name}:`, error);
    return false;
  }
}
