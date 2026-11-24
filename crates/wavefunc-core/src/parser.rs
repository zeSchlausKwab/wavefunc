use std::collections::{HashMap, HashSet};

use nostr_sdk::prelude::*;
use serde::Deserialize;

use crate::config::{ADMIN_FEATURED_LISTS_LABEL, APP_DATA_KIND, FAVORITES_LIST_LABEL, STATION_KIND};
use crate::models::{FacetCount, FeaturedList, Station, StationFacets, StationStream, StreamQuality};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawStationContent {
    description: Option<String>,
    #[serde(default)]
    streams: Vec<StationStream>,
    streaming_server_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawFavoritesContent {
    name: Option<String>,
    description: Option<String>,
    image: Option<String>,
    banner: Option<String>,
}

/// Trim whitespace and stray markdown backticks from stream URLs.
pub fn normalize_url(url: &str) -> String {
    url.trim().trim_matches('`').trim().to_string()
}

fn first_tag_value(event: &Event, name: &str) -> Option<String> {
    event.tags.iter().find_map(|tag| {
        let slice = tag.as_slice();
        if slice.first().map(|s| s.as_str()) == Some(name) {
            slice
                .get(1)
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        } else {
            None
        }
    })
}

fn parse_stream_tag(slice: &[String]) -> Option<StationStream> {
    if slice.first().map(|s| s.as_str()) != Some("stream") {
        return None;
    }
    let url = normalize_url(slice.get(1)?);
    if url.is_empty() {
        return None;
    }
    let format = slice.get(2)?.trim().to_string();
    if format.is_empty() {
        return None;
    }
    let quality_raw = slice.get(3)?;
    let quality: StreamQuality = serde_json::from_str(quality_raw).ok()?;
    let primary = slice.iter().skip(4).any(|s| s == "primary");

    Some(StationStream {
        url,
        format,
        quality,
        primary,
    })
}

/// Sort streams so primary streams come first, followed by HTTPS and higher bitrate.
pub fn sort_streams_by_preference(mut streams: Vec<StationStream>) -> Vec<StationStream> {
    streams.sort_by(|a, b| {
        b.primary
            .cmp(&a.primary)
            .then_with(|| {
                b.url
                    .starts_with("https://")
                    .cmp(&a.url.starts_with("https://"))
            })
            .then_with(|| b.quality.bitrate.cmp(&a.quality.bitrate))
    });
    streams
}

/// Parse a Nostr `kind 31237` event into a `Station`.
pub fn parse_station_event(event: &Event, relay_hints: &[String]) -> Option<Station> {
    if event.kind != Kind::Custom(STATION_KIND) {
        return None;
    }

    let station_id = first_tag_value(event, "d")?;
    let content = serde_json::from_str::<RawStationContent>(&event.content).ok();

    let tag_streams: Vec<StationStream> = event
        .tags
        .iter()
        .filter_map(|tag| parse_stream_tag(tag.as_slice()))
        .collect();

    let mut streams = if !tag_streams.is_empty() {
        tag_streams
    } else {
        content
            .as_ref()
            .map(|c| {
                c.streams
                    .iter()
                    .cloned()
                    .map(|mut s| {
                        s.url = normalize_url(&s.url);
                        s
                    })
                    .filter(|s| !s.url.is_empty())
                    .collect()
            })
            .unwrap_or_default()
    };

    streams = sort_streams_by_preference(streams);
    if streams.is_empty() {
        return None;
    }

    let pubkey_hex = event.pubkey.to_hex();
    let address = format!("{STATION_KIND}:{pubkey_hex}:{station_id}");

    let coordinate = Coordinate::new(Kind::Custom(STATION_KIND), event.pubkey)
        .identifier(station_id.clone());
    let relays: Vec<RelayUrl> = relay_hints
        .iter()
        .filter_map(|r| RelayUrl::parse(r).ok())
        .collect();
    let nip19_coord = Nip19Coordinate::new(coordinate, relays);
    let naddr = nip19_coord.to_bech32().unwrap_or_else(|_| address.clone());

    let name = first_tag_value(event, "name").unwrap_or_else(|| station_id.clone());
    let description = first_tag_value(event, "description")
        .or_else(|| content.as_ref().and_then(|c| c.description.clone()));

    let genres: Vec<String> = event
        .tags
        .iter()
        .filter_map(|tag| {
            let slice = tag.as_slice();
            if slice.first().map(|s| s.as_str()) == Some("c")
                && slice.get(2).map(|s| s.as_str()) == Some("genre")
            {
                slice
                    .get(1)
                    .map(|g| g.trim().to_string())
                    .filter(|g| !g.is_empty())
            } else {
                None
            }
        })
        .collect();

    let languages: Vec<String> = event
        .tags
        .iter()
        .filter_map(|tag| {
            let slice = tag.as_slice();
            if slice.first().map(|s| s.as_str()) == Some("l") {
                slice
                    .get(1)
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
            } else {
                None
            }
        })
        .collect();

    Some(Station {
        id: event.id.to_hex(),
        pubkey: pubkey_hex,
        station_id,
        address,
        naddr,
        created_at: event.created_at.as_secs(),
        name,
        description,
        thumbnail: first_tag_value(event, "thumbnail"),
        website: first_tag_value(event, "website"),
        location: first_tag_value(event, "location"),
        country_code: first_tag_value(event, "country"),
        genres,
        languages,
        streams,
        streaming_server_url: content.and_then(|c| c.streaming_server_url),
    })
}

/// Deduplicate addressable station events by `address`, keeping the newest `created_at`.
pub fn deduplicate_stations(stations: Vec<Station>) -> Vec<Station> {
    let mut by_address: HashMap<String, Station> = HashMap::new();
    for station in stations {
        match by_address.get(&station.address) {
            Some(existing) if existing.created_at >= station.created_at => {}
            _ => {
                by_address.insert(station.address.clone(), station);
            }
        }
    }
    let mut result: Vec<Station> = by_address.into_values().collect();
    result.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    result
}

/// Tokenize text identically to the WaveFunc Bleve search analyzer.
pub fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// Returns true if every query token matches a full token or token prefix on the station.
pub fn matches_station_search(station: &Station, query: &str) -> bool {
    let terms = tokenize(query);
    if terms.is_empty() {
        return true;
    }

    let mut station_tokens: HashSet<String> = HashSet::new();
    let fields: [Option<&str>; 5] = [
        Some(station.name.as_str()),
        station.description.as_deref(),
        station.location.as_deref(),
        station.website.as_deref(),
        station.country_code.as_deref(),
    ];

    for field in fields.into_iter().flatten() {
        station_tokens.extend(tokenize(field));
    }
    for genre in &station.genres {
        station_tokens.extend(tokenize(genre));
    }
    for lang in &station.languages {
        station_tokens.extend(tokenize(lang));
    }

    terms.iter().all(|term| {
        station_tokens.contains(term) || station_tokens.iter().any(|tok| tok.starts_with(term))
    })
}

/// Compute sorted genre, language, and country counts from a station slice.
pub fn compute_facets(stations: &[Station]) -> StationFacets {
    let mut genres: HashMap<String, u32> = HashMap::new();
    let mut languages: HashMap<String, u32> = HashMap::new();
    let mut countries: HashMap<String, u32> = HashMap::new();

    for station in stations {
        for g in &station.genres {
            *genres.entry(g.to_lowercase()).or_insert(0) += 1;
        }
        for l in &station.languages {
            *languages.entry(l.to_lowercase()).or_insert(0) += 1;
        }
        if let Some(cc) = &station.country_code {
            if !cc.trim().is_empty() {
                *countries.entry(cc.trim().to_uppercase()).or_insert(0) += 1;
            }
        }
    }

    fn sort_map(map: HashMap<String, u32>) -> Vec<FacetCount> {
        let mut items: Vec<FacetCount> = map
            .into_iter()
            .map(|(name, count)| FacetCount { name, count })
            .collect();
        items.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
        items
    }

    StationFacets {
        genres: sort_map(genres),
        languages: sort_map(languages),
        countries: sort_map(countries),
    }
}

/// Extract referenced `30078:<pubkey>:<d>` addresses from an admin featured lists event.
pub fn parse_admin_featured_list_refs(event: &Event) -> Vec<String> {
    if event.kind != Kind::Custom(APP_DATA_KIND) {
        return Vec::new();
    }
    if first_tag_value(event, "l").as_deref() != Some(ADMIN_FEATURED_LISTS_LABEL) {
        return Vec::new();
    }

    event
        .tags
        .iter()
        .filter_map(|tag| {
            let slice = tag.as_slice();
            if slice.first().map(|s| s.as_str()) == Some("a") {
                slice
                    .get(1)
                    .filter(|v| v.starts_with("30078:"))
                    .cloned()
            } else {
                None
            }
        })
        .collect()
}

/// Parse a `kind 30078` WaveFunc favorites list event.
pub fn parse_favorites_list_event(event: &Event) -> Option<FeaturedList> {
    if event.kind != Kind::Custom(APP_DATA_KIND) {
        return None;
    }
    if first_tag_value(event, "l").as_deref() != Some(FAVORITES_LIST_LABEL) {
        return None;
    }
    let favorites_id = first_tag_value(event, "d")?;
    let content = serde_json::from_str::<RawFavoritesContent>(&event.content).ok();
    let pubkey_hex = event.pubkey.to_hex();
    let address = format!("{APP_DATA_KIND}:{pubkey_hex}:{favorites_id}");

    let name = first_tag_value(event, "name")
        .or_else(|| content.as_ref().and_then(|c| c.name.clone()))
        .unwrap_or_else(|| "Curated Collection".to_string());
    let description = first_tag_value(event, "description")
        .or_else(|| content.as_ref().and_then(|c| c.description.clone()));

    let station_addresses: Vec<String> = event
        .tags
        .iter()
        .filter_map(|tag| {
            let slice = tag.as_slice();
            if slice.first().map(|s| s.as_str()) == Some("a") {
                slice
                    .get(1)
                    .filter(|v| v.starts_with(&format!("{STATION_KIND}:")))
                    .cloned()
            } else {
                None
            }
        })
        .collect();

    Some(FeaturedList {
        id: event.id.to_hex(),
        pubkey: pubkey_hex,
        favorites_id,
        address,
        name,
        description,
        image: content.as_ref().and_then(|c| c.image.clone()),
        banner: content.and_then(|c| c.banner),
        station_addresses,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_station_event() -> Event {
        let keys = Keys::generate();
        let tags = vec![
            Tag::parse(["d", "flux-fm-klubradio"]).unwrap(),
            Tag::parse(["name", "FLUX FM-KlubRadio"]).unwrap(),
            Tag::parse(["description", "Berlin electronic club stream"]).unwrap(),
            Tag::parse(["country", "DE"]).unwrap(),
            Tag::parse(["c", "electronic", "genre"]).unwrap(),
            Tag::parse(["c", "techno", "genre"]).unwrap(),
            Tag::parse(["l", "german"]).unwrap(),
            Tag::parse([
                "stream",
                "http://streams.fluxfm.de/klubradio/mp3-128/audio/",
                "audio/mpeg",
                r#"{"bitrate":128000,"codec":"mp3","sampleRate":44100}"#,
            ])
            .unwrap(),
            Tag::parse([
                "stream",
                "https://streams.fluxfm.de/klubradio/mp3-320/audio/",
                "audio/mpeg",
                r#"{"bitrate":320000,"codec":"mp3","sampleRate":44100}"#,
                "primary",
            ])
            .unwrap(),
        ];

        EventBuilder::new(Kind::Custom(STATION_KIND), "{}")
            .tags(tags)
            .finalize(&keys)
            .expect("sign test event")
    }

    #[test]
    fn parses_station_and_prefers_primary_stream() {
        let event = sample_station_event();
        let station = parse_station_event(&event, &["wss://relay.wavefunc.live".to_string()])
            .expect("valid station");

        assert_eq!(station.name, "FLUX FM-KlubRadio");
        assert_eq!(station.country_code.as_deref(), Some("DE"));
        assert_eq!(station.genres, vec!["electronic", "techno"]);
        assert_eq!(station.languages, vec!["german"]);
        assert_eq!(station.streams.len(), 2);
        assert!(station.streams[0].primary);
        assert_eq!(station.streams[0].format_badge(), "MP3 320K");
        assert!(station.naddr.starts_with("naddr1"));
    }

    #[test]
    fn tokenized_search_matches_hyphenated_names_and_prefixes() {
        let event = sample_station_event();
        let station = parse_station_event(&event, &[]).expect("valid station");

        assert!(matches_station_search(&station, "flux fm"));
        assert!(matches_station_search(&station, "klub elec"));
        assert!(!matches_station_search(&station, "classical"));
    }

    #[test]
    fn computes_facets_sorted_by_frequency() {
        let event = sample_station_event();
        let station = parse_station_event(&event, &[]).expect("valid station");
        let facets = compute_facets(&[station]);

        assert_eq!(facets.genres.len(), 2);
        assert_eq!(facets.countries[0].name, "DE");
        assert_eq!(facets.countries[0].count, 1);
    }
}
