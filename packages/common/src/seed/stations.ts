import type { NostrEvent } from "@nostr-dev-kit/ndk";
import { RADIO_EVENT_KINDS } from "../nostr/radio";

export const seedStations: NostrEvent[] = [
  {
    kind: RADIO_EVENT_KINDS.STREAM,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
    content: JSON.stringify({
      name: "Jazz FM",
      description: "24/7 Jazz and Blues Radio",
      website: "https://jazzfm.example.com",
      streams: [
        {
          url: "https://stream.jazzfm.example.com/high",
          format: "audio/mpeg",
          quality: {
            bitrate: 320000,
            codec: "mp3",
            sampleRate: 48000,
          },
          primary: true,
        },
      ],
    }),
    tags: [
      ["t", "jazz"],
      ["t", "blues"],
      ["l", "en"],
      ["genre", "jazz"],
      ["genre", "blues"],
      ["location", "New York, US"],
      ["thumbnail", "https://picsum.photos/seed/jazz/400/400"],
      ["client", "nostr_radio"],
    ],
  },
  {
    kind: RADIO_EVENT_KINDS.STREAM,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
    content: JSON.stringify({
      name: "Classical Radio",
      description: "Classical music from the greatest composers",
      website: "https://classical.example.com",
      streams: [
        {
          url: "https://stream.classical.example.com/main",
          format: "audio/mpeg",
          quality: {
            bitrate: 256000,
            codec: "mp3",
            sampleRate: 48000,
          },
          primary: true,
        },
      ],
    }),
    tags: [
      ["t", "classical"],
      ["t", "orchestra"],
      ["l", "en"],
      ["genre", "classical"],
      ["location", "Vienna, AT"],
      ["thumbnail", "https://picsum.photos/seed/classical/400/400"],
      ["client", "nostr_radio"],
    ],
  },
  {
    kind: RADIO_EVENT_KINDS.STREAM,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "", // Will be set during seeding
    content: JSON.stringify({
      name: "Synthwave 24/7",
      description: "Non-stop retro synthwave and retrowave",
      website: "https://synthwave.example.com",
      streams: [
        {
          url: "https://stream.synthwave.example.com/live",
          format: "audio/aac",
          quality: {
            bitrate: 192000,
            codec: "aac",
            sampleRate: 44100,
          },
          primary: true,
        },
      ],
    }),
    tags: [
      ["t", "synthwave"],
      ["t", "electronic"],
      ["l", "en"],
      ["genre", "electronic"],
      ["genre", "synthwave"],
      ["location", "Los Angeles, US"],
      ["thumbnail", "https://picsum.photos/seed/synthwave/400/400"],
      ["client", "nostr_radio"],
    ],
  },
];

export const seedStationKeys = {
  jazzfm: {
    npub: "npub14zl3zsashjg6dz5ulvh9cj2z0hmyyl5e7v7hsylxwskh2m6y27wsw8sc3z",
    nsec: "nsec1p5hr62krg2zr438ddgh7snrww5unyq4xtk0kvecsvax0fmg6m7xsas8fqz",
  },
  classical: {
    npub: "npub1v974hsushfgn3d7wswjaxazstfa7wtycdv5cszez9rndxj95y4cqfqkjht",
    nsec: "nsec1tsl9ytw3rhe4h05rmhqcjan5pz2dwvcxxvt8y4jnzrq3rza0n7qqclccmg",
  },
  synthwave: {
    npub: "npub1ph9t8pgtym3kuasd6vtp5zrmce4yrf2uz48fx0dhrlpwrg3xnscs7g50dt",
    nsec: "nsec1vyue8fvxr62qhlct9j5rj923t4pszslgmgydrc5t9ru78kc57n5sugm8al",
  },
} as const;
