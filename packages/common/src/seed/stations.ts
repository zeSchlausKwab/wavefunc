import type { NostrEvent } from "@nostr-dev-kit/ndk";
import { RADIO_EVENT_KINDS } from "../nostr/radio";

// Keys for different radio organizations
export const seedStationKeys = {
  fip: {
    npub: "npub14zl3zsashjg6dz5ulvh9cj2z0hmyyl5e7v7hsylxwskh2m6y27wsw8sc3z",
    nsec: "nsec1p5hr62krg2zr438ddgh7snrww5unyq4xtk0kvecsvax0fmg6m7xsas8fqz",
  },
  soma: {
    npub: "npub1v974hsushfgn3d7wswjaxazstfa7wtycdv5cszez9rndxj95y4cqfqkjht",
    nsec: "nsec1tsl9ytw3rhe4h05rmhqcjan5pz2dwvcxxvt8y4jnzrq3rza0n7qqclccmg",
  },
  iwayhigh: {
    npub: "npub1ph9t8pgtym3kuasd6vtp5zrmce4yrf2uz48fx0dhrlpwrg3xnscs7g50dt",
    nsec: "nsec1vyue8fvxr62qhlct9j5rj923t4pszslgmgydrc5t9ru78kc57n5sugm8al",
  },
} as const;

export const seedStations: NostrEvent[] = [
  // FIP Radio Stations
  {
    kind: RADIO_EVENT_KINDS.STREAM,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
    content: JSON.stringify({
      name: "FIP Radio",
      description:
        "Curious and sophisticated: Since 1971 FIP offers a versatile program of jazz, chansons, world music and electronic tunes.",
      website: "https://www.radio.net/s/fip",
      streams: [
        {
          url: "https://icecast.radiofrance.fr/fiprock-hifi.aac",
          format: "audio/aac",
          quality: {
            bitrate: 128000,
            codec: "aac",
            sampleRate: 44100,
          },
          primary: true,
        },
        {
          url: "https://stream.fip.example.com/high",
          format: "audio/aac",
          quality: {
            bitrate: 256000,
            codec: "aac",
            sampleRate: 48000,
          },
        },
      ],
    }),
    tags: [
      ["t", "jazz"],
      ["t", "world"],
      ["t", "electronic"],
      ["l", "fr"],
      ["genre", "jazz"],
      ["genre", "world"],
      ["genre", "electronic"],
      ["location", "Paris, FR"],
      ["thumbnail", "https://picsum.photos/seed/fip/400/400"],
      ["client", "nostr_radio"],
    ],
  },
  {
    kind: RADIO_EVENT_KINDS.STREAM,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "", // Will be set to FIP's pubkey
    content: JSON.stringify({
      name: "FIP Rock",
      description:
        "FIP's dedicated rock music channel featuring pop and rock music.",
      website: "https://www.radio.net/s/fipautourdurock",
      streams: [
        {
          url: "https://icecast.radiofrance.fr/fip-hifi.aac",
          format: "audio/aac",
          quality: {
            bitrate: 128000,
            codec: "aac",
            sampleRate: 44100,
          },
          primary: true,
        },
      ],
    }),
    tags: [
      ["t", "rock"],
      ["t", "pop"],
      ["l", "fr"],
      ["genre", "rock"],
      ["genre", "pop"],
      ["location", "Paris, FR"],
      ["thumbnail", "https://picsum.photos/seed/fiprock/400/400"],
      ["client", "nostr_radio"],
    ],
  },

  // SomaFM Stations
  {
    kind: RADIO_EVENT_KINDS.STREAM,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
    content: JSON.stringify({
      name: "Drone Zone",
      description:
        "Served best chilled, safe with most medications. Atmospheric textures with minimal beats.",
      website: "https://somafm.com/dronezone/",
      streams: [
        {
          url: "https://ice.somafm.com/dronezone-128-aac",
          format: "audio/aac",
          quality: {
            bitrate: 128000,
            codec: "aac",
            sampleRate: 44100,
          },
          primary: true,
        },
        {
          url: "https://ice.somafm.com/dronezone-256-mp3",
          format: "audio/mpeg",
          quality: {
            bitrate: 256000,
            codec: "mp3",
            sampleRate: 48000,
          },
        },
      ],
    }),
    tags: [
      ["t", "ambient"],
      ["t", "electronic"],
      ["t", "space"],
      ["l", "en"],
      ["genre", "ambient"],
      ["genre", "electronic"],
      ["location", "San Francisco, US"],
      ["thumbnail", "https://picsum.photos/seed/dronezone/400/400"],
      ["client", "nostr_radio"],
    ],
  },
  {
    kind: RADIO_EVENT_KINDS.STREAM,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "", // Will be set to SomaFM's pubkey
    content: JSON.stringify({
      name: "Vaporwaves",
      description:
        "All Vaporwave. All the time. The aesthetic of a time gone by with a modern interpretation.",
      website: "https://somafm.com/vaporwaves/",
      streams: [
        {
          url: "https://ice.somafm.com/vaporwaves-128-aac",
          format: "audio/aac",
          quality: {
            bitrate: 128000,
            codec: "aac",
            sampleRate: 44100,
          },
          primary: true,
        },
      ],
    }),
    tags: [
      ["t", "vaporwave"],
      ["t", "electronic"],
      ["l", "en"],
      ["genre", "vaporwave"],
      ["genre", "electronic"],
      ["location", "San Francisco, US"],
      ["thumbnail", "https://picsum.photos/seed/vaporwaves/400/400"],
      ["client", "nostr_radio"],
    ],
  },
  {
    kind: RADIO_EVENT_KINDS.STREAM,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
    content: JSON.stringify({
      name: "Cliqhop IDM",
      description:
        "Blips'n'beeps backed mostly w/beats. Intelligent Dance Music.",
      website: "https://somafm.com/cliqhop/",
      streams: [
        {
          url: "https://ice.somafm.com/cliqhop-128-aac",
          format: "audio/aac",
          quality: {
            bitrate: 128000,
            codec: "aac",
            sampleRate: 44100,
          },
          primary: true,
        },
        {
          url: "https://ice.somafm.com/cliqhop-256-mp3",
          format: "audio/mpeg",
          quality: {
            bitrate: 256000,
            codec: "mp3",
            sampleRate: 48000,
          },
        },
      ],
    }),
    tags: [
      ["t", "idm"],
      ["t", "electronic"],
      ["t", "experimental"],
      ["l", "en"],
      ["genre", "idm"],
      ["genre", "electronic"],
      ["location", "San Francisco, US"],
      ["thumbnail", "https://picsum.photos/seed/cliqhop/400/400"],
      ["client", "nostr_radio"],
    ],
  },

  // iWayHigh Station
  {
    kind: RADIO_EVENT_KINDS.STREAM,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
    content: JSON.stringify({
      name: "iWayHigh",
      description: "Dub electro chill radio",
      website: "http://iwayhigh.net/radio.php",
      streams: [
        {
          url: "http://172.105.24.4:8000/;",
          format: "audio/mpeg",
          quality: {
            bitrate: 128000,
            codec: "mp3",
            sampleRate: 44100,
          },
          primary: true,
        },
      ],
    }),
    tags: [
      ["t", "dub"],
      ["t", "electronic"],
      ["t", "chill"],
      ["l", "en"],
      ["genre", "dub"],
      ["genre", "electronic"],
      ["genre", "chill"],
      ["location", "Unknown"],
      ["thumbnail", "https://picsum.photos/seed/iwayhigh/400/400"],
      ["client", "nostr_radio"],
    ],
  },
];
