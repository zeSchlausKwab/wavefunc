import { Station } from "@wavefunc/common";

export const stations: Station[] = [
  {
    id: "1",
    name: "Jazz FM",
    genre: "Jazz",
    website: "http://jazzfm.com",
    imageUrl: "https://picsum.photos/seed/jazzfm/400/400",
    isUserOwned: true,
    description: "Smooth jazz to keep you in the zone",
    pubkey: "npub1x8hxhdt8jg9e3vxyvxdl87ufu5fvejjt2mutns3gp57qqs9ke29qwpjqmt",
    tags: [
      ["genre", "Jazz"],
      ["mood", "relaxed"],
    ],
    streams: [
      {
        url: "http://jazzfm.com/stream",
        format: "audio/mpeg",
        quality: {
          bitrate: 128000,
          codec: "mp3",
          sampleRate: 44100,
        },
        primary: true,
      },
    ],
    created_at: 1687968000000,
  },
  {
    id: "2",
    name: "Classical Vibes",
    genre: "Classical",
    website: "http://classicalvibes.com",
    imageUrl: "https://picsum.photos/seed/classicalvibes/400/400",
    isUserOwned: true,
    description: "Timeless classical music for concentration",
    pubkey: "npub1x8hxhdt8jg9e3vxyvxdl87ufu5fvejjt2mutns3gp57qqs9ke29qwpjqmt",
    tags: [
      ["genre", "Classical"],
      ["mood", "focused"],
    ],
    streams: [
      {
        url: "http://classicalvibes.com/stream",
        format: "audio/mpeg",
        quality: {
          bitrate: 320000,
          codec: "mp3",
          sampleRate: 48000,
        },
        primary: true,
      },
    ],
    created_at: 1688054400000,
  },
  {
    id: "3",
    name: "Electro Beats",
    genre: "Electronic",
    website: "http://electrobeats.com",
    imageUrl: "https://picsum.photos/seed/electrobeats/400/400",
    isUserOwned: false,
    description: "Non-stop electronic dance music",
    pubkey: "npub1rs847gv05xt4fteu8qg9kn7yz5tic5gmmlhnrdjjl58hyls3dguqtrpnk8",
    tags: [
      ["genre", "Electronic"],
      ["mood", "energetic"],
    ],
    streams: [
      {
        url: "http://electrobeats.com/stream",
        format: "audio/mpeg",
        quality: {
          bitrate: 192000,
          codec: "mp3",
          sampleRate: 44100,
        },
        primary: true,
      },
    ],
    created_at: 1688140800000,
  },
  {
    id: "4",
    name: "Hip Hop Nation",
    genre: "Hip Hop",
    website: "http://hiphopnation.com",
    imageUrl: "https://picsum.photos/seed/hiphopnation/400/400",
    isUserOwned: false,
    description: "The hottest hip hop tracks",
    pubkey: "npub1rs847gv05xt4fteu8qg9kn7yz5tic5gmmlhnrdjjl58hyls3dguqtrpnk8",
    tags: [
      ["genre", "Hip Hop"],
      ["mood", "urban"],
    ],
    streams: [
      {
        url: "http://hiphopnation.com/stream",
        format: "audio/mpeg",
        quality: {
          bitrate: 192000,
          codec: "mp3",
          sampleRate: 44100,
        },
        primary: true,
      },
    ],
    created_at: 1688227200000,
  },
  {
    id: "5",
    name: "Rock Radio",
    genre: "Rock",
    website: "http://rockradio.com",
    imageUrl: "https://picsum.photos/seed/rockradio/400/400",
    isUserOwned: true,
    description: "Classic and modern rock hits",
    pubkey: "npub1x8hxhdt8jg9e3vxyvxdl87ufu5fvejjt2mutns3gp57qqs9ke29qwpjqmt",
    tags: [
      ["genre", "Rock"],
      ["mood", "energetic"],
    ],
    streams: [
      {
        url: "http://rockradio.com/stream",
        format: "audio/mpeg",
        quality: {
          bitrate: 192000,
          codec: "mp3",
          sampleRate: 44100,
        },
        primary: true,
      },
    ],
    created_at: 1688313600000,
  },
  {
    id: "6",
    name: "Chill Lounge",
    genre: "Ambient",
    website: "http://chilllounge.com",
    imageUrl: "https://picsum.photos/seed/chilllounge/400/400",
    isUserOwned: false,
    description: "Relaxing ambient sounds for ultimate chill",
    pubkey: "npub1rs847gv05xt4fteu8qg9kn7yz5tic5gmmlhnrdjjl58hyls3dguqtrpnk8",
    tags: [
      ["genre", "Ambient"],
      ["mood", "relaxed"],
    ],
    streams: [
      {
        url: "http://chilllounge.com/stream",
        format: "audio/mpeg",
        quality: {
          bitrate: 128000,
          codec: "mp3",
          sampleRate: 44100,
        },
        primary: true,
      },
    ],
    created_at: 1688400000000,
  },
  {
    id: "7",
    name: "Country Roads",
    genre: "Country",
    website: "http://countryroads.com",
    imageUrl: "https://picsum.photos/seed/countryroads/400/400",
    isUserOwned: true,
    description: "The best in country music",
    pubkey: "npub1x8hxhdt8jg9e3vxyvxdl87ufu5fvejjt2mutns3gp57qqs9ke29qwpjqmt",
    tags: [
      ["genre", "Country"],
      ["mood", "nostalgic"],
    ],
    streams: [
      {
        url: "http://countryroads.com/stream",
        format: "audio/mpeg",
        quality: {
          bitrate: 128000,
          codec: "mp3",
          sampleRate: 44100,
        },
        primary: true,
      },
    ],
    created_at: 1688486400000,
  },
  {
    id: "8",
    name: "Reggae Waves",
    genre: "Reggae",
    website: "http://reggaewaves.com",
    imageUrl: "https://picsum.photos/seed/reggaewaves/400/400",
    isUserOwned: false,
    description: "Laid-back reggae vibes",
    pubkey: "npub1rs847gv05xt4fteu8qg9kn7yz5tic5gmmlhnrdjjl58hyls3dguqtrpnk8",
    tags: [
      ["genre", "Reggae"],
      ["mood", "chill"],
    ],
    streams: [
      {
        url: "http://reggaewaves.com/stream",
        format: "audio/mpeg",
        quality: {
          bitrate: 128000,
          codec: "mp3",
          sampleRate: 44100,
        },
        primary: true,
      },
    ],
    created_at: 1688572800000,
  },
  {
    id: "9",
    name: "Synthwave Dreams",
    genre: "Synthwave",
    website: "http://synthwavedreams.com",
    imageUrl: "https://picsum.photos/seed/synthwavedreams/400/400",
    isUserOwned: true,
    description: "Retro-futuristic electronic music",
    pubkey: "npub1x8hxhdt8jg9e3vxyvxdl87ufu5fvejjt2mutns3gp57qqs9ke29qwpjqmt",
    tags: [
      ["genre", "Synthwave"],
      ["mood", "nostalgic"],
    ],
    streams: [
      {
        url: "http://synthwavedreams.com/stream",
        format: "audio/mpeg",
        quality: {
          bitrate: 192000,
          codec: "mp3",
          sampleRate: 44100,
        },
        primary: true,
      },
    ],
    created_at: 1688659200000,
  },
  {
    id: "10",
    name: "Smooth R&B",
    genre: "R&B",
    website: "http://smoothrnb.com",
    imageUrl: "https://picsum.photos/seed/smoothrnb/400/400",
    isUserOwned: false,
    description: "Soulful R&B hits",
    pubkey: "npub1rs847gv05xt4fteu8qg9kn7yz5tic5gmmlhnrdjjl58hyls3dguqtrpnk8",
    tags: [
      ["genre", "R&B"],
      ["mood", "smooth"],
    ],
    streams: [
      {
        url: "http://smoothrnb.com/stream",
        format: "audio/mpeg",
        quality: {
          bitrate: 192000,
          codec: "mp3",
          sampleRate: 44100,
        },
        primary: true,
      },
    ],
    created_at: 1688745600000,
  },
];
