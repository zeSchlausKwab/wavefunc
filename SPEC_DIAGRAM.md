# NostrRadio Event System Diagram

This diagram shows the relationships between different event types in the NostrRadio specification.

```mermaid
erDiagram
    RADIO_STATION_31237 {
        string id PK
        string pubkey
        number created_at
        number kind "31237"
        json content
        string d_tag "Unique identifier"
        string name "Station name"
        string website "Optional"
        string thumbnail "Optional"
        string language "Multiple allowed"
        string countryCode "Optional"
        string location "Optional"
        string t_genre "Multiple allowed"
        array client_tag "Optional"
    }
    
    FAVORITES_LIST_30078 {
        string id PK
        string pubkey
        number created_at
        number kind "30078"
        json content
        string d_tag "Unique identifier"
        string l_label "user_favourite_list"
        string name "List name"
        string description "List description"
        array a_tags "Station references"
        array client_tag "Optional"
    }
    
    FEATURED_LIST_30078 {
        string id PK
        string pubkey
        number created_at
        number kind "30078"
        json content
        string d_tag "Unique identifier"
        string l_label "featured_station_list"
        string name "List name"
        string description "List description"
        string topic "Theme identifier"
        array a_tags "Station references"
        string t_category "Multiple allowed"
        array client_tag "Optional"
    }
    
    HANDLER_31990 {
        string id PK
        string pubkey
        number created_at
        number kind "31990"
        json content
        string d_tag "Handler identifier"
        string k_kind "Supported kind: 31237"
        string web_template "URL template"
    }
    
    RECOMMENDATION_31989 {
        string id PK
        string pubkey
        number created_at
        number kind "31989"
        json content
        string d_tag "Recommendation identifier"
    }
    
    STREAM_OBJECT {
        string url "Stream URL"
        string format "MIME type"
        object quality "Quality specs"
        boolean primary "Is primary stream"
    }
    
    QUALITY_OBJECT {
        number bitrate "Bits per second"
        string codec "Audio codec"
        number sampleRate "Sample rate Hz"
    }
    
    CLIENT_TAG {
        string client_name "NostrRadio"
        string handler_id "31990:pubkey:d-tag"
        string relay_url "Optional relay"
    }

    %% Relationships
    RADIO_STATION_31237 ||--o{ STREAM_OBJECT : contains
    STREAM_OBJECT ||--|| QUALITY_OBJECT : has
    
    FAVORITES_LIST_30078 }o--o{ RADIO_STATION_31237 : references_via_a_tags
    FEATURED_LIST_30078 }o--o{ RADIO_STATION_31237 : references_via_a_tags
    
    HANDLER_31990 ||--o{ RADIO_STATION_31237 : declares_handler_for
    
    RADIO_STATION_31237 ||--o| CLIENT_TAG : includes
    FAVORITES_LIST_30078 ||--o| CLIENT_TAG : includes
    FEATURED_LIST_30078 ||--o| CLIENT_TAG : includes
    
    HANDLER_31990 ||--o{ RECOMMENDATION_31989 : may_generate
```

## Event Relationships

1. **Radio Station Events (31237)** - Core station definitions with streams and metadata
2. **Favorites Lists (30078)** - User collections of favorite stations  
3. **Featured Lists (30078)** - Curated collections with same kind but different label
4. **Handler Events (31990)** - App declarations as station handlers
5. **Recommendation Events (31989)** - Handler-generated recommendations

### Key Relationships

- **Lists reference stations** via 'a' tags containing station event IDs
- **Handlers declare support** for station events via 'k' tags
- **All events can include client tags** referencing handlers for attribution
- **Stations contain stream objects** with quality specifications
- **Both list types use kind 30078** but are distinguished by their 'l' label tag