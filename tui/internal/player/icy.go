package player

import (
	"context"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// TrackInfo holds parsed "now playing" track metadata from ICY or observer events.
type TrackInfo struct {
	Raw    string
	Artist string
	Song   string
	Source string // "icy" | "mpv" | "ffplay" | "observer"
}

func (t TrackInfo) Empty() bool {
	return strings.TrimSpace(t.Raw) == "" && strings.TrimSpace(t.Song) == "" && strings.TrimSpace(t.Artist) == ""
}

func (t TrackInfo) Display() string {
	artist := strings.TrimSpace(t.Artist)
	song := strings.TrimSpace(t.Song)
	switch {
	case artist != "" && song != "":
		return artist + " — " + song
	case song != "":
		return song
	case artist != "":
		return artist
	default:
		return strings.TrimSpace(t.Raw)
	}
}

var streamTitleRe = regexp.MustCompile(`StreamTitle='([^']*)'`)

// ParseICYMetaBlock extracts StreamTitle from a raw ICY metadata block.
func ParseICYMetaBlock(block []byte) string {
	clean := strings.TrimRight(string(block), "\x00")
	m := streamTitleRe.FindStringSubmatch(clean)
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}

// ParseStreamTitle splits common "Artist - Song" formats cleanly.
func ParseStreamTitle(raw, source string) TrackInfo {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.HasPrefix(strings.ToLower(raw), "http://") || strings.HasPrefix(strings.ToLower(raw), "https://") {
		return TrackInfo{}
	}
	for _, sep := range []string{" - ", " — ", " – ", " | "} {
		if idx := strings.Index(raw, sep); idx > 0 {
			artist := strings.TrimSpace(raw[:idx])
			song := strings.TrimSpace(raw[idx+len(sep):])
			if artist != "" && song != "" {
				return TrackInfo{
					Raw:    raw,
					Artist: artist,
					Song:   song,
					Source: source,
				}
			}
		}
	}
	return TrackInfo{
		Raw:    raw,
		Song:   raw,
		Source: source,
	}
}

var icyHTTPClient = &http.Client{
	Timeout: 6 * time.Second,
}

// ProbeICY performs a lightweight Icecast/Shoutcast metadata probe directly
// from Go without needing a CORS proxy.
func ProbeICY(ctx context.Context, streamURL string) (TrackInfo, error) {
	if streamURL == "" || strings.Contains(strings.ToLower(streamURL), ".m3u8") {
		return TrackInfo{}, errors.New("stream does not support inline ICY metadata")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, streamURL, nil)
	if err != nil {
		return TrackInfo{}, err
	}
	req.Header.Set("Icy-MetaData", "1")
	req.Header.Set("User-Agent", "WaveFunc-TUI/1.0")
	req.Header.Set("Accept", "*/*")

	resp, err := icyHTTPClient.Do(req)
	if err != nil {
		return TrackInfo{}, err
	}
	defer resp.Body.Close()

	metaintRaw := resp.Header.Get("icy-metaint")
	if metaintRaw == "" {
		return TrackInfo{}, errors.New("no icy-metaint header")
	}
	metaint, err := strconv.Atoi(strings.TrimSpace(metaintRaw))
	if err != nil || metaint <= 0 || metaint > 1<<20 {
		return TrackInfo{}, errors.New("invalid icy-metaint header")
	}

	// Skip the audio bytes preceding the first inline metadata frame.
	if _, err := io.CopyN(io.Discard, resp.Body, int64(metaint)); err != nil {
		return TrackInfo{}, err
	}
	var lenBuf [1]byte
	if _, err := io.ReadFull(resp.Body, lenBuf[:]); err != nil {
		return TrackInfo{}, err
	}
	metaLen := int(lenBuf[0]) * 16
	if metaLen == 0 {
		return TrackInfo{}, nil
	}
	metaBuf := make([]byte, metaLen)
	if _, err := io.ReadFull(resp.Body, metaBuf); err != nil {
		return TrackInfo{}, err
	}
	title := ParseICYMetaBlock(metaBuf)
	return ParseStreamTitle(title, "icy"), nil
}
