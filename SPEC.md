# NostrRadio - Application Specification

This document defines the event kinds, content formats, and tag structures used in the NostrRadio application.

## Event Kinds

| Kind  | Description                 | Replaceable? | NIP Reference |
| ----- | --------------------------- | ------------ | ------------- |
| 31237 | Radio Station Event         | Yes, d-tag   | -             |
| 30078 | Favorites List              | Yes, d-tag   | NIP-78        |
| 31990 | NIP-89 Handler Event        | Yes, d-tag   | NIP-89        |
| 31989 | NIP-89 Recommendation Event | Yes, d-tag   | NIP-89        |

## Radio Station Events (kind 31237)

Radio Station events are used to define a radio station and its streams. These events are replaceable using the `d` tag.

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

| Tag Name    | Description                      | Format                                |
| ----------- | -------------------------------- | ------------------------------------- |
| t           | Station genre/category           | String (can have multiple)            |
| thumbnail   | Station logo/image URL           | URL                                   |
| language    | Station language                 | ISO language code (can have multiple) |
| countryCode | Station country                  | ISO 3166-2 country code               |
| location    | Physical location of the station | String (e.g., "Paris, FR")            |
| website     | Station's website                | URL                                   |
| client      | Client that published the event  | [Format specification](#client-tag)   |

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
        ["t", "jazz"],
        ["t", "world"],
        ["t", "electronic"],
        ["language", "fr"],
        ["countryCode", "FR"],
        ["location", "Paris, FR"],
        ["thumbnail", "https://picsum.photos/seed/fip/400/400"],
        [
            "client",
            "NostrRadio",
            "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123",
            "wss://relay.wavefunc.io"
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
        ["l", "user_favourite_list"],
        ["name", "My Favorite Stations"],
        ["description", "Stations I listen to every day"],
        ["p", "<app's pubkey>"],
        ["a", "31237:<pubkey>:<d-tag>", "wss://relay.wavefunc.live", "FIP Radio", "1690000000"],
        ["a", "31237:<pubkey>:<d-tag>", "wss://relay.wavefunc.live", "Soma FM Drone Zone", "1690000001"],
        [
            "client",
            "NostrRadio",
            "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123",
            "wss://relay.wavefunc.io"
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
| t           | Category/genre tag (can have multiple) | String                              |
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
        ["d", "jazz-blues-collection"],
        ["l", "featured_station_list"],
        ["topic", "jazz-blues"],
        ["t", "jazz"],
        ["t", "blues"],
        ["t", "featured"],
        ["p", "<app's pubkey>"],
        ["a", "31237:<pubkey>:<d-tag>", "wss://relay.wavefunc.live", "WBGO Jazz 88.3", "1"],
        ["a", "31237:<pubkey>:<d-tag>", "wss://relay.wavefunc.live", "Jazz FM", "2"],
        ["a", "31237:<pubkey>:<d-tag>", "wss://relay.wavefunc.live", "Blues Radio", "3"],
        [
            "client",
            "NostrRadio",
            "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123",
            "wss://relay.wavefunc.io"
        ]
    ],
    "sig": "..."
}
```

## NIP-89 Handler Events (kind 31990)

Handler events declare an application as a handler for specific event kinds. In this case, they declare the NostrRadio application as a handler for radio station events.

### Content Format

The content field must be a JSON string with the following structure:

```json
{
    "name": "NostrRadio",
    "display_name": "Nostr Radio",
    "picture": "https://wavefunc.io/icons/logo.png",
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
    "content": "{\"name\":\"NostrRadio\",\"display_name\":\"Nostr Radio\",\"picture\":\"https://wavefunc.io/icons/logo.png\",\"about\":\"A radio station directory and player built on Nostr\",\"nip90\":{\"content\":[\"text/plain\"]}}",
    "tags": [
        ["d", "handler123"],
        ["k", "31237"],
        ["web", "https://wavefunc.io/station/<bech32>", "naddr"],
        ["web", "https://wavefunc.io/profile/<bech32>", "npub"],
        ["web", "https://wavefunc.io/stations", "naddr"]
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
["client", "NostrRadio", "31990:000000000000000000000000000000000000000000000000000000000000radio:handler123", "wss://relay.wavefunc.io"]
```

## Implementation Notes

1. **Station Name as d-tag**: It is recommended to use the station name as the d-tag value for radio station events to make them more predictable and ensure uniqueness.

2. **Client Tags**: Due to privacy implications, clients SHOULD allow users to opt-out of including client tags in their published events.

3. **Tag Indexing**: The `i` tag is used for improved searchability of stations by name. It stores the trimmed station name and should be used as the primary index for name-based searches.

4. **Thumbnail/Favicon**: For consistency, use the `thumbnail` tag for images rather than `favicon` or other variations.

5. **Language Codes**: Language codes should be stored in individual `l` tags rather than as an array in the content to improve filterability.

6. **Genre/Category Tags**: Genres and categories are stored as `t` tags for consistency with Nostr conventions around topic/categorical tags.

7. **Station Streams**: A station may have multiple streams with different quality levels. The `primary` field should be set to `true` for the default stream that should be played.

8. **Deleted Stations**: To delete a station, publish a kind 5 event referencing the station's event ID.
