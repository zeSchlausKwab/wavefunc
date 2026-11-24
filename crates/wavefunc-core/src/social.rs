use std::collections::{HashMap, HashSet};

use nostr::prelude::*;
use serde::Deserialize;
use serde_json::json;

use crate::config::{
    APP_DATA_KIND, COMMENT_KIND, COMMUNITY_POST_KIND, COMMUNITY_TOPIC, FAVORITES_LIST_LABEL,
    LISTENING_STATUS_KIND, NUTZAP_KIND, REACTION_KIND, SONG_KIND, SONG_LIST_LABEL, STATION_KIND,
    ZAP_RECEIPT_KIND, ZAP_REQUEST_KIND,
};
use crate::error::{Result, WavefuncError};
use crate::models::{
    CommunityPost, NostrProfile, SavedSong, StationCardCounts, StationComment,
};

#[derive(Debug, Deserialize)]
struct RawProfileContent {
    name: Option<String>,
    display_name: Option<String>,
    #[serde(rename = "displayName")]
    display_name_camel: Option<String>,
    picture: Option<String>,
    nip05: Option<String>,
    about: Option<String>,
    lud16: Option<String>,
    lud06: Option<String>,
}

fn first_tag(event: &Event, name: &str) -> Option<String> {
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

fn short_pubkey(pubkey: &PublicKey) -> String {
    let npub = pubkey.to_bech32().unwrap_or_else(|_| pubkey.to_hex());
    if npub.len() > 16 {
        format!("{}...{}", &npub[..10], &npub[npub.len() - 6..])
    } else {
        npub
    }
}

pub fn profile_label(pubkey: &PublicKey, profiles: &HashMap<String, NostrProfile>) -> (String, Option<String>) {
    let hex = pubkey.to_hex();
    if let Some(p) = profiles.get(&hex) {
        (p.label(), p.picture.clone())
    } else {
        (short_pubkey(pubkey), None)
    }
}

/// Parse a Nostr `kind 0` metadata event into `NostrProfile`.
pub fn parse_profile_event(event: &Event) -> Option<NostrProfile> {
    if event.kind != Kind::Metadata {
        return None;
    }
    let raw: RawProfileContent = serde_json::from_str(&event.content).ok()?;
    let pubkey = event.pubkey.to_hex();
    let npub = event.pubkey.to_bech32().unwrap_or_else(|_| pubkey.clone());

    Some(NostrProfile {
        pubkey,
        npub,
        name: raw.name.filter(|s| !s.trim().is_empty()),
        display_name: raw
            .display_name
            .or(raw.display_name_camel)
            .filter(|s| !s.trim().is_empty()),
        picture: raw.picture.filter(|s| !s.trim().is_empty()),
        nip05: raw.nip05.filter(|s| !s.trim().is_empty()),
        about: raw.about.filter(|s| !s.trim().is_empty()),
        lud16: raw.lud16.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        lud06: raw.lud06.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
    })
}

/// Build a Nostr `kind 0` metadata event from user-supplied profile fields.
pub fn build_profile_event_builder(
    name: Option<&str>,
    about: Option<&str>,
    picture: Option<&str>,
    lud16: Option<&str>,
) -> Result<EventBuilder> {
    let mut map = serde_json::Map::new();
    if let Some(n) = name.map(str::trim).filter(|s| !s.is_empty()) {
        map.insert("name".to_string(), json!(n));
        map.insert("display_name".to_string(), json!(n));
        map.insert("displayName".to_string(), json!(n));
    }
    if let Some(a) = about.map(str::trim).filter(|s| !s.is_empty()) {
        map.insert("about".to_string(), json!(a));
    }
    if let Some(p) = picture.map(str::trim).filter(|s| !s.is_empty()) {
        map.insert("picture".to_string(), json!(p));
        map.insert("image".to_string(), json!(p));
    }
    if let Some(l) = lud16.map(str::trim).filter(|s| !s.is_empty()) {
        map.insert("lud16".to_string(), json!(l));
    }
    let content = serde_json::Value::Object(map).to_string();
    Ok(EventBuilder::new(Kind::Metadata, content))
}

// ─── Favorites Lists (kind 30078, wavefunc_user_favourite_list) ──────────────

pub fn build_favorites_list_builder(
    existing: Option<&Event>,
    station_address: &str,
    add: bool,
) -> Result<EventBuilder> {
    if !station_address.starts_with(&format!("{STATION_KIND}:")) {
        return Err(WavefuncError::InvalidStationAddress(
            station_address.to_string(),
        ));
    }

    let favorites_id = existing
        .and_then(|ev| first_tag(ev, "d"))
        .unwrap_or_else(|| "default-favorites".to_string());
    let name = existing
        .and_then(|ev| first_tag(ev, "name"))
        .unwrap_or_else(|| "My Favorite Stations".to_string());
    let description = existing.and_then(|ev| first_tag(ev, "description"));

    let mut addresses: Vec<String> = existing
        .map(|ev| {
            ev.tags
                .iter()
                .filter_map(|tag| {
                    let s = tag.as_slice();
                    if s.first().map(|x| x.as_str()) == Some("a") {
                        s.get(1)
                            .filter(|v| v.starts_with(&format!("{STATION_KIND}:")))
                            .cloned()
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    if add {
        if !addresses.iter().any(|a| a == station_address) {
            addresses.push(station_address.to_string());
        }
    } else {
        addresses.retain(|a| a != station_address);
    }

    let content = if let Some(desc) = &description {
        json!({ "name": name, "description": desc }).to_string()
    } else {
        json!({ "name": name }).to_string()
    };

    let mut tags = vec![
        Tag::parse(["d", &favorites_id])?,
        Tag::parse(["l", FAVORITES_LIST_LABEL])?,
        Tag::parse(["name", &name])?,
    ];
    if let Some(desc) = &description {
        tags.push(Tag::parse(["description", desc])?);
    }
    for addr in &addresses {
        tags.push(Tag::parse(["a", addr])?);
    }

    Ok(EventBuilder::new(Kind::Custom(APP_DATA_KIND), content).tags(tags))
}

/// Create a brand-new favorites list (`kind 30078`, `wavefunc_user_favourite_list`).
pub fn build_new_favorites_list_builder(
    name: &str,
    description: Option<&str>,
    station_addresses: &[String],
) -> Result<(String, EventBuilder)> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err(WavefuncError::InvalidInput(
            "List name cannot be empty".to_string(),
        ));
    }
    for addr in station_addresses {
        if !addr.starts_with(&format!("{STATION_KIND}:")) {
            return Err(WavefuncError::InvalidStationAddress(addr.clone()));
        }
    }

    let favorites_id = uuid::Uuid::new_v4().to_string();
    let clean_desc = description.map(str::trim).filter(|s| !s.is_empty());
    let content = match clean_desc {
        Some(desc) => json!({ "name": clean_name, "description": desc }).to_string(),
        None => json!({ "name": clean_name }).to_string(),
    };

    let mut tags = vec![
        Tag::parse(["d", &favorites_id])?,
        Tag::parse(["l", FAVORITES_LIST_LABEL])?,
        Tag::parse(["name", clean_name])?,
    ];
    if let Some(desc) = clean_desc {
        tags.push(Tag::parse(["description", desc])?);
    }
    for addr in station_addresses {
        tags.push(Tag::parse(["a", addr])?);
    }

    Ok((
        favorites_id,
        EventBuilder::new(Kind::Custom(APP_DATA_KIND), content).tags(tags),
    ))
}

/// Update metadata (name / description) of an existing favorites list while keeping all stations.
pub fn build_update_favorites_list_builder(
    existing: &Event,
    name: &str,
    description: Option<&str>,
) -> Result<EventBuilder> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err(WavefuncError::InvalidInput(
            "List name cannot be empty".to_string(),
        ));
    }

    let favorites_id = first_tag(existing, "d")
        .ok_or_else(|| WavefuncError::InvalidInput("Missing favorites list d-tag".into()))?;
    let clean_desc = description.map(str::trim).filter(|s| !s.is_empty());
    let content = match clean_desc {
        Some(desc) => json!({ "name": clean_name, "description": desc }).to_string(),
        None => json!({ "name": clean_name }).to_string(),
    };

    let mut tags = vec![
        Tag::parse(["d", &favorites_id])?,
        Tag::parse(["l", FAVORITES_LIST_LABEL])?,
        Tag::parse(["name", clean_name])?,
    ];
    if let Some(desc) = clean_desc {
        tags.push(Tag::parse(["description", desc])?);
    }
    for tag in existing.tags.iter() {
        let s = tag.as_slice();
        if s.first().map(|x| x.as_str()) == Some("a") {
            if let Some(addr) = s.get(1).filter(|v| v.starts_with(&format!("{STATION_KIND}:"))) {
                tags.push(Tag::parse(["a", addr])?);
            }
        }
    }

    Ok(EventBuilder::new(Kind::Custom(APP_DATA_KIND), content).tags(tags))
}

/// Build a NIP-09 `kind 5` deletion event for a user favorites list.
pub fn build_delete_favorites_list_builder(
    event_id: &str,
    pubkey_hex: &str,
    favorites_id: &str,
) -> Result<EventBuilder> {
    let address = format!("{APP_DATA_KIND}:{pubkey_hex}:{favorites_id}");
    let tags = vec![
        Tag::parse(["e", event_id])?,
        Tag::parse(["k", &APP_DATA_KIND.to_string()])?,
        Tag::parse(["p", pubkey_hex])?,
        Tag::parse(["a", &address])?,
    ];
    Ok(EventBuilder::new(Kind::EventDeletion, "Deleted favorites list").tags(tags))
}

// ─── Station Reactions (kind 7) ──────────────────────────────────────────────

pub fn build_station_reaction_builder(
    station_id: &str,
    station_pubkey: &str,
    station_address: &str,
    content: &str,
) -> Result<EventBuilder> {
    let reaction = if content.trim().is_empty() {
        "❤️"
    } else {
        content.trim()
    };

    let tags = vec![
        Tag::parse(["a", station_address])?,
        Tag::parse(["e", station_id])?,
        Tag::parse(["p", station_pubkey])?,
        Tag::parse(["k", &STATION_KIND.to_string()])?,
    ];

    Ok(EventBuilder::new(Kind::Custom(REACTION_KIND), reaction).tags(tags))
}

// ─── Station Comments (NIP-22, kind 1111) ────────────────────────────────────

pub fn build_station_comment_builder(
    station_event_id: &str,
    station_pubkey: &str,
    station_address: &str,
    content: &str,
    reply_to_id: Option<&str>,
    reply_to_pubkey: Option<&str>,
) -> Result<EventBuilder> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err(WavefuncError::InvalidInput(
            "Comment cannot be empty".to_string(),
        ));
    }

    let mut tags = vec![
        Tag::parse(["A", station_address])?,
        Tag::parse(["E", station_event_id])?,
        Tag::parse(["K", &STATION_KIND.to_string()])?,
        Tag::parse(["P", station_pubkey])?,
    ];

    if let (Some(parent_id), Some(parent_pk)) = (reply_to_id, reply_to_pubkey) {
        tags.push(Tag::parse(["e", parent_id])?);
        tags.push(Tag::parse(["k", &COMMENT_KIND.to_string()])?);
        tags.push(Tag::parse(["p", parent_pk])?);
    } else {
        tags.push(Tag::parse(["a", station_address])?);
        tags.push(Tag::parse(["e", station_event_id])?);
        tags.push(Tag::parse(["k", &STATION_KIND.to_string()])?);
        tags.push(Tag::parse(["p", station_pubkey])?);
    }

    Ok(EventBuilder::new(Kind::Custom(COMMENT_KIND), trimmed).tags(tags))
}

fn comment_parent_id(event: &Event, root_station_event_id: &str) -> Option<String> {
    // NIP-22 lowercase `e` pointing to another comment (not root station event)
    let lowercase_k = first_tag(event, "k");
    if lowercase_k.as_deref() == Some("1111") {
        if let Some(e) = first_tag(event, "e") {
            if e != root_station_event_id {
                return Some(e);
            }
        }
    }

    // Legacy NIP-10 reply marker fallback
    let reply_marked = event.tags.iter().find_map(|tag| {
        let s = tag.as_slice();
        if s.first().map(|x| x.as_str()) == Some("e") && s.get(3).map(|x| x.as_str()) == Some("reply")
        {
            s.get(1).cloned()
        } else {
            None
        }
    });
    if let Some(id) = reply_marked {
        if id != root_station_event_id {
            return Some(id);
        }
    }

    None
}

/// Build a cycle-safe, depth-annotated flat list of threaded comments matching `comment-tree.ts`.
pub fn build_comment_tree(
    events: &[Event],
    root_station_event_id: &str,
    profiles: &HashMap<String, NostrProfile>,
) -> Vec<StationComment> {
    let mut by_id: HashMap<String, &Event> = HashMap::new();
    for ev in events {
        if ev.kind == Kind::Custom(COMMENT_KIND) {
            by_id.entry(ev.id.to_hex()).or_insert(ev);
        }
    }

    let mut ordered: Vec<&Event> = by_id.values().copied().collect();
    ordered.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| a.id.cmp(&b.id))
    });

    let known_ids: HashSet<String> = ordered.iter().map(|e| e.id.to_hex()).collect();
    let mut children: HashMap<String, Vec<&Event>> = HashMap::new();
    let mut roots: Vec<&Event> = Vec::new();

    for ev in &ordered {
        let id = ev.id.to_hex();
        let parent = comment_parent_id(ev, root_station_event_id);
        match parent {
            Some(ref p) if known_ids.contains(p) && p != &id => {
                children.entry(p.clone()).or_default().push(*ev);
            }
            _ => roots.push(*ev),
        }
    }

    let mut visited: HashSet<String> = HashSet::new();
    let mut out: Vec<StationComment> = Vec::new();

    #[allow(clippy::too_many_arguments)]
    fn walk<'a>(
        ev: &'a Event,
        depth: u32,
        parent_id: Option<String>,
        children: &HashMap<String, Vec<&'a Event>>,
        profiles: &HashMap<String, NostrProfile>,
        visited: &mut HashSet<String>,
        out: &mut Vec<StationComment>,
    ) {
        let id = ev.id.to_hex();
        if !visited.insert(id.clone()) {
            return;
        }
        let (author_name, author_picture) = profile_label(&ev.pubkey, profiles);
        out.push(StationComment {
            id: id.clone(),
            pubkey: ev.pubkey.to_hex(),
            author_name,
            author_picture,
            content: ev.content.clone(),
            created_at: ev.created_at.as_secs(),
            parent_id,
            depth,
        });

        if depth < 8 {
            if let Some(kids) = children.get(&id) {
                for child in kids.iter().rev() {
                    walk(
                        child,
                        depth + 1,
                        Some(id.clone()),
                        children,
                        profiles,
                        visited,
                        out,
                    );
                }
            }
        }
    }

    for root in roots.iter().chain(ordered.iter()) {
        if !visited.contains(&root.id.to_hex()) {
            walk(root, 0, None, &children, profiles, &mut visited, &mut out);
        }
    }

    out
}

// ─── Community Feed (kind 1 / legacy kind 1111 tagged #wavefunc) ─────────────

pub fn parse_community_posts(
    events: &[Event],
    profiles: &HashMap<String, NostrProfile>,
) -> Vec<CommunityPost> {
    let mut deduped: HashMap<String, &Event> = HashMap::new();
    for ev in events {
        if ev.kind == Kind::Custom(COMMUNITY_POST_KIND) || ev.kind == Kind::Custom(COMMENT_KIND) {
            deduped.entry(ev.id.to_hex()).or_insert(ev);
        }
    }

    let mut reply_counts: HashMap<String, u32> = HashMap::new();
    let mut raw_posts: Vec<CommunityPost> = Vec::new();

    for ev in deduped.values() {
        let categories: Vec<String> = ev
            .tags
            .iter()
            .filter_map(|tag| {
                let s = tag.as_slice();
                if s.first().map(|x| x.as_str()) == Some("t") {
                    s.get(1)
                        .filter(|v| !v.eq_ignore_ascii_case(COMMUNITY_TOPIC))
                        .cloned()
                } else {
                    None
                }
            })
            .collect();

        let mut root_id: Option<String> = None;
        let mut reply_id: Option<String> = None;
        let mut fallback_e: Option<String> = None;

        for tag in ev.tags.iter() {
            let s = tag.as_slice();
            if s.first().map(|x| x.as_str()) == Some("e") {
                if let Some(id) = s.get(1) {
                    match s.get(3).map(|m| m.as_str()) {
                        Some("root") => root_id = Some(id.clone()),
                        Some("reply") => reply_id = Some(id.clone()),
                        _ => {
                            if fallback_e.is_none() {
                                fallback_e = Some(id.clone());
                            }
                        }
                    }
                }
            }
        }

        let parent_id = reply_id.or_else(|| root_id.clone()).or(fallback_e);
        let is_reply = parent_id.is_some() || ev.kind == Kind::Custom(COMMENT_KIND);
        if let Some(ref target) = root_id.clone().or_else(|| parent_id.clone()) {
            *reply_counts.entry(target.clone()).or_insert(0) += 1;
        }

        let (author_name, author_picture) = profile_label(&ev.pubkey, profiles);
        raw_posts.push(CommunityPost {
            id: ev.id.to_hex(),
            pubkey: ev.pubkey.to_hex(),
            author_name,
            author_picture,
            content: ev.content.clone(),
            created_at: ev.created_at.as_secs(),
            categories,
            is_reply,
            parent_id,
            root_id,
            reply_count: 0,
        });
    }

    for post in &mut raw_posts {
        if let Some(count) = reply_counts.get(&post.id) {
            post.reply_count = *count;
        }
    }

    raw_posts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    raw_posts
}

pub fn build_community_post_builder(
    content: &str,
    category: Option<&str>,
    reply_to_id: Option<&str>,
    reply_to_pubkey: Option<&str>,
    root_id: Option<&str>,
    root_pubkey: Option<&str>,
) -> Result<EventBuilder> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err(WavefuncError::InvalidInput(
            "Post content cannot be empty".to_string(),
        ));
    }

    let mut tags = vec![Tag::parse(["t", COMMUNITY_TOPIC])?];

    if let (Some(parent_id), Some(parent_pk)) = (reply_to_id, reply_to_pubkey) {
        let eff_root_id = root_id.unwrap_or(parent_id);
        let eff_root_pk = root_pubkey.unwrap_or(parent_pk);
        tags.push(Tag::parse(["e", eff_root_id, "", "root", eff_root_pk])?);
        if parent_id != eff_root_id {
            tags.push(Tag::parse(["e", parent_id, "", "reply", parent_pk])?);
        }
        tags.push(Tag::parse(["p", parent_pk])?);
        if eff_root_pk != parent_pk {
            tags.push(Tag::parse(["p", eff_root_pk])?);
        }
    } else if let Some(cat) = category.map(str::trim).filter(|c| !c.is_empty() && *c != "general") {
        tags.push(Tag::parse(["t", cat])?);
    }

    Ok(EventBuilder::new(Kind::Custom(COMMUNITY_POST_KIND), trimmed).tags(tags))
}

// ─── Songs (kind 31337) & Song Crates (kind 30078, wavefunc_user_song_list) ──

fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
        if out.len() >= 64 {
            break;
        }
    }
    out.trim_matches('-').to_string()
}

pub fn derive_song_id(title: &str, artist: Option<&str>, mbid: Option<&str>) -> String {
    if let Some(id) = mbid.map(str::trim).filter(|s| !s.is_empty()) {
        return format!("mb-{id}");
    }
    let raw = match artist.map(str::trim).filter(|s| !s.is_empty()) {
        Some(a) => format!("{title}-by-{a}"),
        None => title.to_string(),
    };
    let slug = slugify(&raw);
    if slug.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        slug
    }
}

pub fn parse_song_event(event: &Event) -> Option<SavedSong> {
    if event.kind != Kind::Custom(SONG_KIND) {
        return None;
    }
    let song_id = first_tag(event, "d")?;
    let title = first_tag(event, "title").unwrap_or_else(|| song_id.clone());
    let pubkey = event.pubkey.to_hex();
    let address = format!("{SONG_KIND}:{pubkey}:{song_id}");

    let mut artist: Option<String> = None;
    let mut album: Option<String> = None;
    let mut mbid: Option<String> = None;
    let mut genres: Vec<String> = Vec::new();
    let mut audio_url: Option<String> = None;

    for tag in event.tags.iter() {
        let s = tag.as_slice();
        match s.first().map(|x| x.as_str()) {
            Some("c") if s.get(2).map(|x| x.as_str()) == Some("artist") => {
                artist = s.get(1).cloned();
            }
            Some("c") if s.get(2).map(|x| x.as_str()) == Some("album") => {
                album = s.get(1).cloned();
            }
            Some("i") => {
                if let Some(val) = s.get(1) {
                    if let Some(stripped) = val.strip_prefix("mbid:") {
                        mbid = Some(stripped.to_string());
                    }
                }
            }
            Some("t") => {
                if let Some(g) = s.get(1).filter(|g| !g.trim().is_empty()) {
                    genres.push(g.clone());
                }
            }
            Some("r") if audio_url.is_none() => {
                audio_url = s.get(1).cloned();
            }
            _ => {}
        }
    }

    let duration_secs = first_tag(event, "duration").and_then(|d| d.parse::<u32>().ok());
    let release_year = first_tag(event, "published_at")
        .and_then(|ts| ts.parse::<i64>().ok())
        .map(|secs| (1970 + secs / 31_557_600) as u32);

    Some(SavedSong {
        id: event.id.to_hex(),
        pubkey,
        song_id,
        address,
        title,
        artist,
        album,
        cover_art: first_tag(event, "image"),
        thumb: first_tag(event, "thumb"),
        duration_secs,
        release_year,
        mbid,
        audio_url,
        genres,
        created_at: event.created_at.as_secs(),
    })
}

#[allow(clippy::too_many_arguments)]
pub fn build_song_event_builder(
    title: &str,
    artist: Option<&str>,
    album: Option<&str>,
    mbid: Option<&str>,
    release_id: Option<&str>,
    release_date: Option<&str>,
    duration_ms: Option<u64>,
    genres: &[String],
) -> Result<(String, EventBuilder)> {
    let clean_title = title.trim();
    if clean_title.is_empty() {
        return Err(WavefuncError::InvalidInput(
            "Song title cannot be empty".to_string(),
        ));
    }

    let song_id = derive_song_id(clean_title, artist, mbid);
    let mut tags = vec![
        Tag::parse(["d", &song_id])?,
        Tag::parse(["title", clean_title])?,
    ];

    if let Some(a) = artist.map(str::trim).filter(|s| !s.is_empty()) {
        tags.push(Tag::parse(["c", a, "artist"])?);
    }
    if let Some(alb) = album.map(str::trim).filter(|s| !s.is_empty()) {
        tags.push(Tag::parse(["c", alb, "album"])?);
    }
    if let Some(id) = mbid.map(str::trim).filter(|s| !s.is_empty()) {
        tags.push(Tag::parse(["i", &format!("mbid:{id}")])?);
    }
    if let Some(rid) = release_id.map(str::trim).filter(|s| !s.is_empty()) {
        tags.push(Tag::parse(["i", &format!("release-mbid:{rid}")])?);
        tags.push(Tag::parse([
            "image",
            &format!("https://coverartarchive.org/release/{rid}/front-500"),
        ])?);
        tags.push(Tag::parse([
            "thumb",
            &format!("https://coverartarchive.org/release/{rid}/front-250"),
        ])?);
    }
    if let Some(ms) = duration_ms.filter(|&d| d > 0) {
        tags.push(Tag::parse(["duration", &(ms / 1000).to_string()])?);
    }
    if let Some(year_str) = release_date
        .and_then(|d| d.split('-').next())
        .filter(|y| y.len() == 4)
    {
        if let Ok(year) = year_str.parse::<i64>() {
            let approx_unix = (year - 1970) * 31_557_600;
            if approx_unix > 0 {
                tags.push(Tag::parse(["published_at", &approx_unix.to_string()])?);
            }
        }
    }
    for genre in genres.iter().take(5) {
        if !genre.trim().is_empty() {
            tags.push(Tag::parse(["t", genre.trim()])?);
        }
    }

    Ok((
        song_id,
        EventBuilder::new(Kind::Custom(SONG_KIND), "").tags(tags),
    ))
}

pub fn build_song_list_builder(
    existing: Option<&Event>,
    song_address: &str,
    add: bool,
) -> Result<EventBuilder> {
    if !song_address.starts_with(&format!("{SONG_KIND}:")) {
        return Err(WavefuncError::InvalidInput(format!(
            "Invalid song address: {song_address}"
        )));
    }

    let list_id = existing
        .and_then(|ev| first_tag(ev, "d"))
        .unwrap_or_else(|| "liked-songs".to_string());
    let name = existing
        .and_then(|ev| first_tag(ev, "name"))
        .unwrap_or_else(|| "Liked Songs".to_string());
    let description = existing.and_then(|ev| first_tag(ev, "description"));

    let mut addresses: Vec<String> = existing
        .map(|ev| {
            ev.tags
                .iter()
                .filter_map(|tag| {
                    let s = tag.as_slice();
                    if s.first().map(|x| x.as_str()) == Some("a") {
                        s.get(1)
                            .filter(|v| v.starts_with(&format!("{SONG_KIND}:")))
                            .cloned()
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    if add {
        if !addresses.iter().any(|a| a == song_address) {
            addresses.push(song_address.to_string());
        }
    } else {
        addresses.retain(|a| a != song_address);
    }

    let mut tags = vec![
        Tag::parse(["d", &list_id])?,
        Tag::parse(["l", SONG_LIST_LABEL])?,
        Tag::parse(["name", &name])?,
    ];
    if let Some(desc) = &description {
        tags.push(Tag::parse(["description", desc])?);
    }
    for addr in &addresses {
        tags.push(Tag::parse(["a", addr])?);
    }

    Ok(EventBuilder::new(Kind::Custom(APP_DATA_KIND), "").tags(tags))
}

// ─── NIP-38 Music Listening Status (kind 30315) ──────────────────────────────

pub fn build_listening_status_builder(
    title: Option<&str>,
    artist: Option<&str>,
    station_address: Option<&str>,
    station_url: Option<&str>,
) -> Result<EventBuilder> {
    let now = Timestamp::now().as_secs();
    let expiration = now + 300;

    let content = match title.map(str::trim).filter(|s| !s.is_empty()) {
        Some(t) => {
            let full = match artist.map(str::trim).filter(|s| !s.is_empty()) {
                Some(a) => format!("{a} - {t}"),
                None => t.to_string(),
            };
            full.chars().take(300).collect::<String>()
        }
        None => String::new(),
    };

    let mut tags = vec![
        Tag::parse(["d", "music"])?,
        Tag::parse(["expiration", &expiration.to_string()])?,
    ];

    if !content.is_empty() {
        if let Some(url) = station_url.map(str::trim).filter(|s| !s.is_empty()) {
            tags.push(Tag::parse(["r", url])?);
        }
        if let Some(addr) = station_address.map(str::trim).filter(|s| !s.is_empty()) {
            tags.push(Tag::parse(["a", addr])?);
        }
    }

    Ok(EventBuilder::new(Kind::Custom(LISTENING_STATUS_KIND), content).tags(tags))
}

// ─── NIP-57 Zaps (kind 9734 / 9735), NIP-61 Nutzaps (kind 9321) & Batch Counts

/// Build a NIP-57 `kind 9734` zap request targeting a WaveFunc station.
pub fn build_zap_request_builder(
    station_pubkey: &str,
    station_address: &str,
    amount_msat: u64,
    comment: Option<&str>,
    relays: &[String],
) -> Result<EventBuilder> {
    if !station_address.starts_with(&format!("{STATION_KIND}:")) {
        return Err(WavefuncError::InvalidStationAddress(
            station_address.to_string(),
        ));
    }
    if amount_msat == 0 {
        return Err(WavefuncError::InvalidInput(
            "Zap amount must be greater than zero".to_string(),
        ));
    }

    let mut relay_tag = Vec::with_capacity(relays.len() + 1);
    relay_tag.push("relays".to_string());
    for r in relays.iter().take(6) {
        if !r.trim().is_empty() {
            relay_tag.push(r.trim().to_string());
        }
    }

    let mut tags = Vec::new();
    if relay_tag.len() > 1 {
        tags.push(Tag::parse(relay_tag)?);
    }
    tags.push(Tag::parse(["amount", &amount_msat.to_string()])?);
    tags.push(Tag::parse(["p", station_pubkey])?);
    tags.push(Tag::parse(["a", station_address])?);

    let content = comment.map(str::trim).unwrap_or("");
    Ok(EventBuilder::new(Kind::Custom(ZAP_REQUEST_KIND), content).tags(tags))
}

/// Parse sats from a BOLT11 invoice human-readable prefix (`lnbc<amount><mul>1...`).
pub fn parse_bolt11_sats(bolt11: &str) -> Option<u64> {
    let lower = bolt11.trim().to_ascii_lowercase();
    let sep = lower.rfind('1')?;
    let hrp = &lower[..sep];
    let rest = hrp
        .strip_prefix("lnbcrt")
        .or_else(|| hrp.strip_prefix("lntbs"))
        .or_else(|| hrp.strip_prefix("lntb"))
        .or_else(|| hrp.strip_prefix("lnbc"))?;
    if rest.is_empty() {
        return None;
    }

    let (digits, mul) = match rest.chars().last()? {
        c @ ('m' | 'u' | 'n' | 'p') => (&rest[..rest.len() - 1], Some(c)),
        c if c.is_ascii_digit() => (rest, None),
        _ => return None,
    };

    let value: u64 = digits.parse().ok()?;
    let sats = match mul {
        None => value.saturating_mul(100_000_000),
        Some('m') => value.saturating_mul(100_000),
        Some('u') => value.saturating_mul(100),
        Some('n') => value / 10,
        Some('p') => value / 10_000,
        _ => return None,
    };
    Some(sats)
}

#[derive(Debug, Deserialize)]
struct RawEmbeddedZapRequest {
    pubkey: Option<String>,
    tags: Option<Vec<Vec<String>>>,
}

/// Extract `(sats, sender_pubkey)` from a NIP-57 `kind 9735` zap receipt event.
pub fn extract_zap_receipt_sats_and_sender(event: &Event) -> (u64, Option<String>) {
    if event.kind != Kind::Custom(ZAP_RECEIPT_KIND) {
        return (0, None);
    }

    let mut sats: u64 = 0;
    let mut sender: Option<String> = None;

    if let Some(desc) = first_tag(event, "description") {
        if let Ok(req) = serde_json::from_str::<RawEmbeddedZapRequest>(&desc) {
            sender = req.pubkey.filter(|s| !s.trim().is_empty());
            if let Some(tags) = req.tags {
                for tag in tags {
                    if tag.first().map(|s| s.as_str()) == Some("amount") {
                        if let Some(msat) = tag.get(1).and_then(|v| v.parse::<u64>().ok()) {
                            sats = msat / 1000;
                            break;
                        }
                    }
                }
            }
        }
    }

    if sats == 0 {
        if let Some(bolt11) = first_tag(event, "bolt11") {
            if let Some(parsed) = parse_bolt11_sats(&bolt11) {
                sats = parsed;
            }
        }
    }

    (sats, sender)
}

#[derive(Debug, Deserialize)]
struct RawCashuProof {
    amount: Option<u64>,
}

/// Extract total sats from a NIP-61 `kind 9321` Cashu nutzap event.
pub fn extract_nutzap_sats(event: &Event) -> u64 {
    if event.kind != Kind::Custom(NUTZAP_KIND) {
        return 0;
    }

    let mut total: u64 = 0;
    for tag in event.tags.iter() {
        let s = tag.as_slice();
        if s.first().map(|x| x.as_str()) == Some("proof") {
            if let Some(raw_proof) = s.get(1) {
                if let Ok(proof) = serde_json::from_str::<RawCashuProof>(raw_proof) {
                    total = total.saturating_add(proof.amount.unwrap_or(0));
                }
            }
        }
    }
    total
}

fn target_station_addresses(event: &Event, id_to_addr: &HashMap<String, String>) -> Vec<String> {
    let prefix = format!("{STATION_KIND}:");
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for tag in event.tags.iter() {
        let s = tag.as_slice();
        let name = s.first().map(|x| x.as_str());
        if matches!(name, Some("a") | Some("A")) {
            if let Some(addr) = s.get(1) {
                if addr.starts_with(&prefix) && seen.insert(addr.clone()) {
                    out.push(addr.clone());
                }
            }
        } else if matches!(name, Some("e") | Some("E")) {
            if let Some(ev_id) = s.get(1) {
                if let Some(addr) = id_to_addr.get(ev_id) {
                    if seen.insert(addr.clone()) {
                        out.push(addr.clone());
                    }
                }
            }
        }
    }
    out
}

/// Summarize batched reactions (`kind 7`), comments (`kind 1111`), Lightning zaps (`kind 9735`),
/// and Cashu nutzaps (`kind 9321`) per station address (matching both `#a`/`#A` and `#e`/`#E`).
pub fn summarize_station_social_counts(
    addresses: &[String],
    id_to_addr: &HashMap<String, String>,
    events: &[Event],
    current_pubkey: Option<&str>,
) -> HashMap<String, StationCardCounts> {
    let wanted: HashSet<&str> = addresses.iter().map(String::as_str).collect();
    let mut reaction_authors: HashMap<String, HashSet<String>> = HashMap::new();
    let mut comment_ids: HashMap<String, HashSet<String>> = HashMap::new();
    let mut zap_ids: HashMap<String, HashSet<String>> = HashMap::new();
    let mut zap_sats: HashMap<String, u64> = HashMap::new();
    let mut user_zapped: HashSet<String> = HashSet::new();

    let mut seen_events: HashSet<String> = HashSet::new();
    for ev in events {
        let ev_id = ev.id.to_hex();
        if !seen_events.insert(ev_id.clone()) {
            continue;
        }

        let targets = target_station_addresses(ev, id_to_addr);
        if targets.is_empty() {
            continue;
        }

        for addr in targets {
            if !wanted.is_empty() && !wanted.contains(addr.as_str()) {
                continue;
            }

            if ev.kind == Kind::Custom(REACTION_KIND) {
                if ev.content.trim() != "-" {
                    reaction_authors
                        .entry(addr)
                        .or_default()
                        .insert(ev.pubkey.to_hex());
                }
            } else if ev.kind == Kind::Custom(COMMENT_KIND) {
                comment_ids.entry(addr).or_default().insert(ev_id.clone());
            } else if ev.kind == Kind::Custom(ZAP_RECEIPT_KIND) {
                let (sats, sender) = extract_zap_receipt_sats_and_sender(ev);
                if zap_ids.entry(addr.clone()).or_default().insert(ev_id.clone()) {
                    *zap_sats.entry(addr.clone()).or_insert(0) += sats;
                }
                if let (Some(cur), Some(snd)) = (current_pubkey, sender.as_deref()) {
                    if cur == snd {
                        user_zapped.insert(addr);
                    }
                }
            } else if ev.kind == Kind::Custom(NUTZAP_KIND) {
                let sats = extract_nutzap_sats(ev);
                if zap_ids.entry(addr.clone()).or_default().insert(ev_id.clone()) {
                    *zap_sats.entry(addr.clone()).or_insert(0) += sats;
                }
                if current_pubkey == Some(ev.pubkey.to_hex().as_str()) {
                    user_zapped.insert(addr);
                }
            }
        }
    }

    let mut out = HashMap::new();
    for addr in addresses {
        let reactors = reaction_authors.get(addr);
        let reaction_count = reactors.map_or(0, |s| s.len() as u32);
        let user_reacted = current_pubkey
            .map(|pk| reactors.is_some_and(|s| s.contains(pk)))
            .unwrap_or(false);
        let comment_count = comment_ids.get(addr).map_or(0, |s| s.len() as u32);
        let zap_count = zap_ids.get(addr).map_or(0, |s| s.len() as u32);
        let sats = zap_sats.get(addr).copied().unwrap_or(0);
        let zapped = user_zapped.contains(addr);

        out.insert(
            addr.clone(),
            StationCardCounts {
                station_address: addr.clone(),
                reaction_count,
                user_reacted,
                comment_count,
                zap_count,
                zap_sats: sats,
                user_zapped: zapped,
            },
        );
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bolt11_amounts_and_summarizes_station_social_counts() {
        assert_eq!(parse_bolt11_sats("lnbc210n1pjtest"), Some(21));
        assert_eq!(parse_bolt11_sats("lnbc10u1pjtest"), Some(1000));
        assert_eq!(parse_bolt11_sats("lnbc1m1pjtest"), Some(100_000));

        let alice = Keys::generate();
        let bob = Keys::generate();
        let station_pk = alice.public_key().to_hex();
        let station_addr = format!("31237:{station_pk}:radio-test");
        let station_id = "2222222222222222222222222222222222222222222222222222222222222222";

        let like = build_station_reaction_builder(station_id, &station_pk, &station_addr, "❤️")
            .unwrap()
            .finalize(&alice)
            .unwrap();
        let downvote = build_station_reaction_builder(station_id, &station_pk, &station_addr, "-")
            .unwrap()
            .finalize(&bob)
            .unwrap();
        let comment = build_station_comment_builder(
            station_id,
            &station_pk,
            &station_addr,
            "Love this mix",
            None,
            None,
        )
        .unwrap()
        .finalize(&bob)
        .unwrap();

        let zap_req = build_zap_request_builder(
            &station_pk,
            &station_addr,
            21_000,
            Some("Nice"),
            &["wss://relay.damus.io".to_string()],
        )
        .unwrap()
        .finalize(&alice)
        .unwrap();
        let zap_receipt = EventBuilder::new(Kind::Custom(ZAP_RECEIPT_KIND), "")
            .tags([
                Tag::parse(["a", &station_addr]).unwrap(),
                Tag::parse(["p", &station_pk]).unwrap(),
                Tag::parse(["bolt11", "lnbc210n1pjtest"]).unwrap(),
                Tag::parse(["description", &zap_req.as_json()]).unwrap(),
            ])
            .finalize(&bob)
            .unwrap();

        let nutzap = EventBuilder::new(Kind::Custom(NUTZAP_KIND), "cheers")
            .tags([
                Tag::parse(["a", &station_addr]).unwrap(),
                Tag::parse(["proof", r#"{"amount":64,"id":"abc","secret":"s","C":"c"}"#]).unwrap(),
                Tag::parse(["proof", r#"{"amount":36,"id":"abc","secret":"s2","C":"c2"}"#]).unwrap(),
            ])
            .finalize(&bob)
            .unwrap();

        let counts = summarize_station_social_counts(
            &[station_addr.clone()],
            &HashMap::from([(station_id.to_string(), station_addr.clone())]),
            &[like, downvote, comment, zap_receipt, nutzap],
            Some(&alice.public_key().to_hex()),
        );
        let c = counts.get(&station_addr).expect("counts present");
        assert_eq!(c.reaction_count, 1);
        assert!(c.user_reacted);
        assert_eq!(c.comment_count, 1);
        assert_eq!(c.zap_count, 2);
        assert_eq!(c.zap_sats, 121);
        assert!(c.user_zapped);
    }

    #[test]
    fn builds_and_toggles_favorites_list() {
        let keys = Keys::generate();
        let addr1 = "31237:aaaa:soma";
        let addr2 = "31237:bbbb:nts";

        let ev1 = build_favorites_list_builder(None, addr1, true)
            .unwrap()
            .finalize(&keys)
            .unwrap();
        assert_eq!(ev1.kind, Kind::Custom(APP_DATA_KIND));
        assert_eq!(first_tag(&ev1, "l").as_deref(), Some(FAVORITES_LIST_LABEL));

        let ev2 = build_favorites_list_builder(Some(&ev1), addr2, true)
            .unwrap()
            .finalize(&keys)
            .unwrap();
        let a_tags: Vec<_> = ev2
            .tags
            .iter()
            .filter(|t| t.as_slice().first().map(|s| s.as_str()) == Some("a"))
            .collect();
        assert_eq!(a_tags.len(), 2);

        let ev3 = build_favorites_list_builder(Some(&ev2), addr1, false)
            .unwrap()
            .finalize(&keys)
            .unwrap();
        let a_tags_after: Vec<_> = ev3
            .tags
            .iter()
            .filter(|t| t.as_slice().first().map(|s| s.as_str()) == Some("a"))
            .collect();
        assert_eq!(a_tags_after.len(), 1);
    }

    #[test]
    fn builds_nip22_comment_tree_with_reply_depth() {
        let keys = Keys::generate();
        let station_id = "1111111111111111111111111111111111111111111111111111111111111111";
        let station_pk = keys.public_key().to_hex();
        let station_addr = format!("31237:{station_pk}:radio-1");

        let root_comment = build_station_comment_builder(
            station_id,
            &station_pk,
            &station_addr,
            "Great stream!",
            None,
            None,
        )
        .unwrap()
        .finalize(&keys)
        .unwrap();

        let reply_comment = build_station_comment_builder(
            station_id,
            &station_pk,
            &station_addr,
            "Agreed!",
            Some(&root_comment.id.to_hex()),
            Some(&root_comment.pubkey.to_hex()),
        )
        .unwrap()
        .finalize(&keys)
        .unwrap();

        let tree = build_comment_tree(&[root_comment, reply_comment], station_id, &HashMap::new());
        assert_eq!(tree.len(), 2);
        assert_eq!(tree[0].depth, 0);
        assert_eq!(tree[0].content, "Great stream!");
        assert_eq!(tree[1].depth, 1);
        assert_eq!(tree[1].content, "Agreed!");
    }

    #[test]
    fn builds_song_and_nip38_status() {
        let keys = Keys::generate();
        let (song_id, builder) = build_song_event_builder(
            "Roygbiv",
            Some("Boards of Canada"),
            Some("Music Has the Right to Children"),
            Some("mb-123"),
            None,
            Some("1998-04-20"),
            Some(151_000),
            &["ambient".to_string()],
        )
        .unwrap();
        assert_eq!(song_id, "mb-mb-123");

        let ev = builder.finalize(&keys).unwrap();
        let parsed = parse_song_event(&ev).expect("valid song");
        assert_eq!(parsed.title, "Roygbiv");
        assert_eq!(parsed.artist.as_deref(), Some("Boards of Canada"));
        assert_eq!(parsed.duration_secs, Some(151));

        let status_ev = build_listening_status_builder(
            Some("Roygbiv"),
            Some("Boards of Canada"),
            Some("31237:pk:soma"),
            Some("https://wavefunc.live"),
        )
        .unwrap()
        .finalize(&keys)
        .unwrap();
        assert_eq!(status_ev.kind, Kind::Custom(LISTENING_STATUS_KIND));
        assert_eq!(status_ev.content, "Boards of Canada - Roygbiv");

        let clear_ev = build_listening_status_builder(None, None, None, None)
            .unwrap()
            .finalize(&keys)
            .unwrap();
        assert_eq!(clear_ev.content, "");
    }
}
