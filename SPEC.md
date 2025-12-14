# NostrRadio - Application Specification

This document defines the event kinds, content formats, and tag structures used in the NostrRadio application. This specification complies with the NIP-XX Internet Radio standard for radio station events while extending it with additional social features and application-specific functionality.

## Event Kinds

| Kind  | Description                 | Replaceable? | NIP Reference |
| ----- | --------------------------- | ------------ | ------------- |
| 31237 | Radio Station Event         | Yes, d-tag   | NIP-XX        |
| 30078 | Favorites List              | Yes, d-tag   | NIP-78        |
| 31990 | NIP-89 Handler Event        | Yes, d-tag   | NIP-89        |
| 31989 | NIP-89 Recommendation Event | Yes, d-tag   | NIP-89        |
| 1311  | Live Chat Message           | No           | NIP-53        |
| 1111  | Station Comment             | No           | NIP-22        |

## Radio Station Events (kind 31237)

Radio Station events are used to define a radio station and its streams. These events are replaceable using the `d` tag and comply with the NIP-XX Internet Radio standard.

### Content Format

The content field must be a JSON string with the following structure:

```json
{
  "description": "Detailed station description with **markdown** support.",
  "streams": [
    {
      "url": "https://stream-url.com/stream",
      "format": "audio/mpeg",
      "quality": {
        "bitrate": 128000,
        "codec": "mp3",
        "sampleRate": 44100
      },
      "primary": true
    }
  ],
  "streamingServerUrl": "https://streaming-server.com"
}
```

| Field              | Type   | Required | Description                                     |
| ------------------ | ------ | -------- | ----------------------------------------------- |
| description        | string | Yes      | Detailed description with markdown support      |
| streams            | array  | Yes      | Array of stream objects (at least one required) |
| streamingServerUrl | string | No       | URL to the streaming server (optional)          |

#### Stream Object

| Field   | Type    | Required | Description                        |
| ------- | ------- | -------- | ---------------------------------- |
| url     | string  | Yes      | URL to the audio stream            |
| format  | string  | Yes      | MIME type of the stream            |
| quality | object  | Yes      | Quality specifications             |
| primary | boolean | No       | Whether this is the primary stream |

#### Quality Object

| Field      | Type   | Required | Description                       |
| ---------- | ------ | -------- | --------------------------------- |
| bitrate    | number | Yes      | Stream bitrate in bits per second |
| codec      | string | Yes      | Audio codec (mp3, aac, etc.)      |
| sampleRate | number | Yes      | Sample rate in Hz                 |

### Required Tags

| Tag Name | Description                       | Format                        |
| -------- | --------------------------------- | ----------------------------- |
| d        | Unique identifier for the station | Random string or station name |
| name     | Name of the station               | String                        |

### Recommended Tags

| Tag Name    | Description                      | Format                                            |
| ----------- | -------------------------------- | ------------------------------------------------- |
| c           | Station genre/category           | ["c", "genre_value", "genre"] (can have multiple) |
| thumbnail   | Station logo/image URL           | URL                                               |
| l           | Station language                 | ISO 639-1 language code (can have multiple)       |
| countryCode | Station country                  | ISO 3166-2 country code                           |
| location    | Physical location of the station | String (e.g., "Paris, France")                    |
| g           | Geohash for precise coordinates  | Geohash string                                    |
| website     | Station's website                | URL                                               |
| client      | Client that published the event  | [Format specification](#client-tag)               |

### Example Event

```json
{
  "id": "...",
  "pubkey": "...",
  "created_at": 1690000000,
  "kind": 31237,
  "content": "{\"description\":\"Curious and sophisticated: Since 1971 FIP offers a versatile program of **jazz**, *chansons*, world music and electronic tunes.\",\"streams\":[{\"url\":\"https://icecast.radiofrance.fr/fiprock-hifi.aac\",\"format\":\"audio/aac\",\"quality\":{\"bitrate\":128000,\"codec\":\"aac\",\"sampleRate\":44100},\"primary\":true}]}",
  "tags": [
    ["d", "<random-uuid>"],
    ["name", "FIP Radio"],
    ["website", "https://www.radio.net/s/fip"],
    ["c", "jazz", "genre"],
    ["c", "world", "genre"],
    ["c", "electronic", "genre"],
    ["l", "fr"],
    ["countryCode", "FR"],
    ["location", "Paris, France"],
    ["g", "u09tvw0"],
    ["thumbnail", "https://picsum.photos/seed/fip/400/400"],
    [
      "client",
      "NostrRadio",
      "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123",
      "wss://relay.wavefunc.live"
    ]
  ],
  "sig": "..."
}
```

## Favorites Events (kind 30078)

Favorites events are used to store a user's favorite radio stations as a list. Favorites are stored as 'a' tags in the event.

### Content Format

The content field must be a JSON string with the following structure:

```json
{
  "name": "My Favorite Stations",
  "description": "A collection of my favorite radio stations",
  "image": "https://example.com/favorites-image.jpg",
  "banner": "https://example.com/favorites-banner.jpg"
}
```

| Field       | Type   | Required | Description                           |
| ----------- | ------ | -------- | ------------------------------------- |
| name        | string | Yes      | Name of the favorites list            |
| description | string | Yes      | Description of the favorites list     |
| image       | string | No       | URL to an image representing the list |
| banner      | string | No       | URL to a banner image for the list    |
| l           | string | Yes      | event label (user_favourite_list)     |

### Required Tags

| Tag Name | Description                    | Format                          |
| -------- | ------------------------------ | ------------------------------- |
| d        | Unique identifier for the list | Random string or descriptive ID |

### Favorite Tags ('a' tags)

Favorite stations are stored using 'a' tags with the following format:

| Tag Name | Format                                           | Example                                                               |
| -------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| a        | ['a', event_id, relay_url?, petname?, added_at?] | ['a', 'abc123', 'wss://relay.example.com', 'FIP Radio', '1690000000'] |

- `event_id`: The event ID of the favorited station
- `relay_url` (optional): Hint for where to find the station event
- `petname` (optional): User-assigned name for the station
- `added_at` (optional): Unix timestamp when the station was added

### Recommended Tags

| Tag Name    | Description                       | Format                              |
| ----------- | --------------------------------- | ----------------------------------- |
| name        | Name of the favorites list        | String                              |
| description | Description of the favorites list | String                              |
| client      | Client that published the event   | [Format specification](#client-tag) |

### Example Event

```json
{
  "id": "...",
  "pubkey": "...",
  "created_at": 1690000000,
  "kind": 30078,
  "content": "{\"name\":\"My Favorite Stations\",\"description\":\"Stations I listen to every day\",\"image\":\"https://example.com/favorites-image.jpg\",\"banner\":\"https://example.com/favorites-banner.jpg\"}",
  "tags": [
    ["d", "<random-uuid>"],
    ["l", "wavefunc_user_favourite_list"],
    ["name", "My Favorite Stations"],
    ["description", "Stations I listen to every day"],
    ["p", "<app's pubkey>"],
    [
      "a",
      "31237:<pubkey>:<d-tag>",
      "wss://relay.wavefunc.live",
      "FIP Radio",
      "1690000000"
    ],
    [
      "a",
      "31237:<pubkey>:<d-tag>",
      "wss://relay.wavefunc.live",
      "Soma FM Drone Zone",
      "1690000001"
    ],
    [
      "client",
      "NostrRadio",
      "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123",
      "wss://relay.wavefunc.live"
    ]
  ],
  "sig": "..."
}
```

## Featured Station Lists (kind 30078)

Featured Station Lists are curated collections of radio stations grouped by theme, genre, mood, or other organizing principles. These are typically created by the application or trusted curators to showcase stations to users. Like favorites lists, these events use kind 30078 but with a different label tag value to distinguish them.

### Content Format

The content field must be a JSON string with the following structure:

```json
{
  "name": "Jazz & Blues Stations",
  "description": "The best jazz and blues radio stations from around the world",
  "image": "https://example.com/jazz-image.jpg",
  "banner": "https://example.com/jazz-banner.jpg",
  "topic": "jazz-blues"
}
```

| Field       | Type   | Required | Description                               |
| ----------- | ------ | -------- | ----------------------------------------- |
| name        | string | Yes      | Name of the featured list                 |
| description | string | Yes      | Description of the featured list          |
| image       | string | No       | URL to an image representing the list     |
| banner      | string | No       | URL to a banner image for the list        |
| topic       | string | Yes      | Topic/theme identifier for the collection |

### Required Tags

| Tag Name | Description                    | Format                          |
| -------- | ------------------------------ | ------------------------------- |
| d        | Unique identifier for the list | Random string or descriptive ID |
| l        | Label for list type            | "featured_station_list"         |

### Station Tags ('a' tags)

Featured stations are stored using 'a' tags with the following format:

| Tag Name | Format                                             | Example                                                      |
| -------- | -------------------------------------------------- | ------------------------------------------------------------ |
| a        | ['a', event_id, relay_url?, display_name?, order?] | ['a', 'abc123', 'wss://relay.example.com', 'FIP Radio', '1'] |

- `event_id`: The event ID of the featured station
- `relay_url` (optional): Hint for where to find the station event
- `display_name` (optional): Display name to use for the station in this list
- `order` (optional): Numeric order/rank within the list (lower numbers appear first)

### Recommended Tags

| Tag Name    | Description                            | Format                              |
| ----------- | -------------------------------------- | ----------------------------------- |
| name        | Name of the featured list              | String                              |
| description | Description of the featured list       | String                              |
| topic       | Topic/theme tag for the collection     | String                              |
| c           | Category/genre tag (can have multiple) | ["c", "genre_value", "genre"]       |
| client      | Client that published the event        | [Format specification](#client-tag) |
| p           | Pubkey of the curator (app or user)    | String                              |
| created_by  | Attribution for the curator (optional) | String                              |

### Example Event

```json
{
  "id": "...",
  "pubkey": "000000000000000000000000000000000000000000000000000000000000radio",
  "created_at": 1690000000,
  "kind": 30078,
  "content": "{\"name\":\"Jazz & Blues Stations\",\"description\":\"The best jazz and blues radio stations from around the world\",\"image\":\"https://example.com/jazz-image.jpg\",\"banner\":\"https://example.com/jazz-banner.jpg\",\"topic\":\"jazz-blues\"}",
  "tags": [
    ["d", "<random-uuid>"],
    ["l", "featured_station_list"],
    ["topic", "jazz-blues"],
    ["c", "jazz", "genre"],
    ["c", "blues", "genre"],
    ["c", "featured", "category"],
    ["p", "<app's pubkey>"],
    [
      "a",
      "31237:<pubkey>:<d-tag>",
      "wss://relay.wavefunc.live",
      "WBGO Jazz 88.3",
      "1"
    ],
    [
      "a",
      "31237:<pubkey>:<d-tag>",
      "wss://relay.wavefunc.live",
      "Jazz FM",
      "2"
    ],
    [
      "a",
      "31237:<pubkey>:<d-tag>",
      "wss://relay.wavefunc.live",
      "Blues Radio",
      "3"
    ],
    [
      "client",
      "NostrRadio",
      "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123",
      "wss://relay.wavefunc.live"
    ]
  ],
  "sig": "..."
}
```

## Live Chat Messages (kind 1311)

Live Chat Messages are used to enable real-time chat functionality for radio stations. These events attach to radio station events and allow listeners to chat while listening to a station. This follows NIP-53 Live Activities specification.

### Content Format

The content field contains the chat message text. Markdown formatting is supported.

```
"Hello everyone! Loving this jazz station 🎷"
```

### Required Tags

| Tag Name | Description                          | Format                   |
| -------- | ------------------------------------ | ------------------------ |
| a        | Reference to the radio station event | "31237:<pubkey>:<d-tag>" |

### Optional Tags

| Tag Name | Description                     | Format                                   |
| -------- | ------------------------------- | ---------------------------------------- |
| e        | Reply to another chat message   | Event ID of the message being replied to |
| q        | Quote/cite another event        | Event ID or address of quoted content    |
| client   | Client that published the event | [Format specification](#client-tag)      |

### Example Event

```json
{
  "id": "...",
  "pubkey": "...",
  "created_at": 1690000000,
  "kind": 1311,
  "content": "This is such a great jazz station! Anyone know what song this is? 🎵",
  "tags": [
    [
      "a",
      "31237:000000000000000000000000000000000000000000000000000000000000radio:fip-radio",
      "wss://relay.wavefunc.live",
      "root"
    ],
    [
      "client",
      "NostrRadio",
      "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123",
      "wss://relay.wavefunc.live"
    ]
  ],
  "sig": "..."
}
```

### Reply Example

```json
{
  "id": "...",
  "pubkey": "...",
  "created_at": 1690000001,
  "kind": 1311,
  "content": "I think it's Miles Davis - Kind of Blue! Classic album 🎺",
  "tags": [
    [
      "a",
      "31237:000000000000000000000000000000000000000000000000000000000000radio:fip-radio",
      "wss://relay.wavefunc.live",
      "root"
    ],
    ["e", "previous-chat-message-id"],
    [
      "client",
      "NostrRadio",
      "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123",
      "wss://relay.wavefunc.live"
    ]
  ],
  "sig": "..."
}
```

### Usage Notes

1. **Station Association**: Chat messages MUST include an `a` tag referencing the radio station event they are associated with.

2. **Real-time Updates**: Clients should subscribe to kind 1311 events filtered by the station's `a` tag to display live chat.

3. **Threading**: Use `e` tags to create threaded conversations within the chat.

4. **Moderation**: Station owners may implement moderation by creating lists of blocked users or messages.

5. **Rate Limiting**: Clients should implement appropriate rate limiting to prevent spam.

6. **Persistence**: Chat messages are stored on relays and can be queried for chat history.

## Station Comments (kind 1111)

Station Comments are used to provide persistent commentary and discussion about radio stations. This follows [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) for comment events. Unlike live chat messages, comments are designed for longer-form discussion and can be threaded with replies. Comments are associated with specific radio station events.

### Content Format

The content field contains the comment text as plaintext. Per NIP-22, no HTML, Markdown, or other formatting is allowed.

```
"This station has an amazing selection of underground jazz. Been listening for months and they always surprise me with new artists I've never heard before!"
```

### Required Tags (Per NIP-22)

**Root Scope Tags (Uppercase)**
| Tag Name | Description | Format |
| -------- | ------------------------------------ | ----------------------------------------- |
| E | Reference to the radio station event | Event ID (root scope) |
| K | Kind of the root event | "31237" |
| P | Pubkey of the root event author | Pubkey (root scope) |

**Parent Item Tags (Lowercase)**
| Tag Name | Description | Format |
| -------- | ------------------------------------ | ----------------------------------------- |
| e | Reference to the parent item | Event ID (parent - station or comment) |
| k | Kind of the parent item | "31237" (station) or "1111" (comment) |
| p | Pubkey of the parent item author | Pubkey (parent) |

### Optional Tags

| Tag Name | Description                     | Format                              |
| -------- | ------------------------------- | ----------------------------------- |
| q        | Quote/cite events in content    | Event ID or address (NIP-21)        |
| client   | Client that published the event | [Format specification](#client-tag) |

### Example Root Comment

```json
{
  "id": "...",
  "pubkey": "...",
  "created_at": 1690000000,
  "kind": 1111,
  "content": "This station has an amazing selection of underground jazz. Been listening for months and they always surprise me with new artists!",
  "tags": [
    ["E", "station-event-id"],
    ["K", "31237"],
    ["P", "station-owner-pubkey"],
    ["e", "station-event-id"],
    ["k", "31237"],
    ["p", "station-owner-pubkey"],
    [
      "client",
      "NostrRadio",
      "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123",
      "wss://relay.wavefunc.live"
    ]
  ],
  "sig": "..."
}
```

### Example Reply Comment

```json
{
  "id": "...",
  "pubkey": "...",
  "created_at": 1690000001,
  "kind": 1111,
  "content": "Totally agree! Their late night sets are particularly incredible. Have you heard their Sunday evening jazz fusion block?",
  "tags": [
    ["E", "station-event-id"],
    ["K", "31237"],
    ["P", "station-owner-pubkey"],
    ["e", "station-event-id"],
    ["k", "31237"],
    ["p", "station-owner-pubkey"],
    ["e", "parent-comment-id"],
    ["k", "1111"],
    ["p", "parent-comment-author-pubkey"],
    [
      "client",
      "NostrRadio",
      "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123",
      "wss://relay.wavefunc.live"
    ]
  ],
  "sig": "..."
}
```

### Usage Notes

1. **NIP-22 Compliance**: This implementation follows [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) for comment threading. Comments MUST use uppercase tags for root scope and lowercase tags for parent items.

2. **Tag Structure (Per NIP-22)**:

   - **Root Scope**: Uppercase tags (E, K, P) always point to the radio station event
   - **Parent Item**: Lowercase tags (e, k, p) point to the immediate parent (station for root comments, comment for replies)
   - Both `K` and `k` tags MUST be present to define event kinds

3. **Comment Hierarchy**:

   - **Root Comments**: Parent tags reference the station event (e=station-id, k="31237")
   - **Reply Comments**: Parent tags reference the parent comment (e=comment-id, k="1111")

4. **Query Patterns**:

   - Fetch all comments for a station: Filter by `kind: 1111` and `#E: [station-event-id]`
   - Fetch replies to a comment: Filter by `kind: 1111` and `#e: [comment-id]` with `#k: ["1111"]`

5. **Threading Logic**:

   - Root comments: `k` tag contains "31237" (station kind)
   - Reply comments: `k` tag contains "1111" (comment kind)
   - All comments maintain root scope reference to the original station

6. **Content Restrictions**: Per NIP-22, content MUST be plaintext only - no HTML, Markdown, or other formatting allowed.

7. **Sorting**: Comments are typically sorted by `created_at` timestamp, with newest first for root comments and oldest first for replies within a thread.

## NIP-89 Handler Events (kind 31990)

Handler events declare an application as a handler for specific event kinds. In this case, they declare the NostrRadio application as a handler for radio station events.

### Content Format

The content field must be a JSON string with the following structure:

```json
{
  "name": "NostrRadio",
  "display_name": "Nostr Radio",
  "picture": "https://wavefunc.live/icons/logo.png",
  "about": "A radio station directory and player built on Nostr",
  "nip90": {
    "content": ["text/plain"]
  }
}
```

| Field        | Type   | Required | Description                            |
| ------------ | ------ | -------- | -------------------------------------- |
| name         | string | Yes      | Identifier name of the application     |
| display_name | string | Yes      | Human-readable name of the application |
| picture      | string | Yes      | URL to the application's logo          |
| about        | string | Yes      | Description of the application         |
| nip90        | object | No       | NIP-90 related fields                  |

### Required Tags

| Tag Name | Description                       | Format               |
| -------- | --------------------------------- | -------------------- |
| d        | Unique identifier for the handler | Random string        |
| k        | Event kinds this handler supports | String (kind number) |

### Recommended Tags

| Tag Name | Description                      | Format                |
| -------- | -------------------------------- | --------------------- |
| web      | Web URL template for the handler | URL with placeholders |

### Example Event

```json
{
  "id": "...",
  "pubkey": "000000000000000000000000000000000000000000000000000000000000radio",
  "created_at": 1690000000,
  "kind": 31990,
  "content": "{\"name\":\"NostrRadio\",\"display_name\":\"Nostr Radio\",\"picture\":\"https://wavefunc.live/icons/logo.png\",\"about\":\"A radio station directory and player built on Nostr\",\"nip90\":{\"content\":[\"text/plain\"]}}",
  "tags": [
    ["d", "handler123"],
    ["k", "31237"],
    ["web", "https://wavefunc.live/station/<bech32>", "naddr"],
    ["web", "https://wavefunc.live/profile/<bech32>", "npub"],
    ["web", "https://wavefunc.live/stations", "naddr"]
  ],
  "sig": "..."
}
```

## Client Tag

Client tags identify the client application that published a note. This is implemented according to general Nostr conventions and has the following format:

```
["client", "ClientName", "HandlerId", "RelayURL"]
```

| Field      | Description                                                |
| ---------- | ---------------------------------------------------------- |
| "client"   | The literal string "client"                                |
| ClientName | Name of the client (e.g., "NostrRadio")                    |
| HandlerId  | NIP-89 handler identifier in format "31990:pubkey:d-value" |
| RelayURL   | Optional URL to a relay where the handler can be found     |

### Example

```
["client", "NostrRadio", "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123", "wss://relay.wavefunc.live"]
```

## Implementation Notes

1. **NIP-XX Compliance**: Radio station events (kind 31237) comply with the NIP-XX Internet Radio standard, using the updated tag format including `l` for language codes and `g` for geohash coordinates.

2. **Station Name as d-tag**: It is recommended to use the station name as the d-tag value for radio station events to make them more predictable and ensure uniqueness.

3. **Client Tags**: Due to privacy implications, clients SHOULD allow users to opt-out of including client tags in their published events.

4. **Tag Indexing**: The `i` tag is used for improved searchability of stations by name. It stores the trimmed station name and should be used as the primary index for name-based searches.

5. **Thumbnail/Favicon**: For consistency, use the `thumbnail` tag for images rather than `favicon` or other variations.

6. **Language Codes**: Language codes should be stored in individual `l` tags rather than as an array in the content to improve filterability.

7. **Genre/Category Tags**: Genres and categories are stored as `c` tags using the format `["c", "genre_value", "genre"]` for consistency with category-based tagging conventions. Use `"genre"` for musical genres and `"category"` for other classifications.

8. **Station Streams**: A station may have multiple streams with different quality levels. The `primary` field should be set to `true` for the default stream that should be played.

9. **Deleted Stations**: To delete a station, publish a kind 5 event referencing the station's event ID.

10. **Geohash Support**: The `g` tag contains geohash coordinates for precise geographical discovery, enabling location-based station filtering and discovery.
