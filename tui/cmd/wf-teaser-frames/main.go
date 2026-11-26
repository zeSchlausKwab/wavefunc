package main

import (
	"encoding/json"
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"

	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/player"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/ui"
)

type frameRecord struct {
	Frame int    `json:"frame"`
	Theme string `json:"theme"`
	ANSI  string `json:"ansi"`
}

func demoStations() ([]nostrclient.Station, map[string]nostrclient.StationHealth, map[string]nostrclient.StationTrack) {
	mk := func(id, name, country, loc, desc string, genres []string, codec string, bitrate int, url string) nostrclient.Station {
		return nostrclient.Station{
			ID:          id,
			PubKey:      "210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2",
			StationID:   id,
			Address:     "31237:210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2:" + id,
			Name:        name,
			CountryCode: country,
			Location:    loc,
			Description: desc,
			Genres:      genres,
			Streams: []nostrclient.Stream{
				{
					URL:     url,
					Format:  "audio/" + codec,
					Quality: nostrclient.StreamQuality{Bitrate: bitrate, Codec: codec, SampleRate: 44100},
					Primary: true,
				},
			},
		}
	}

	stations := []nostrclient.Station{
		mk("fip-radio", "FIP Radio", "FR", "Paris, France",
			"Eclectic French public radio weaving jazz, soul, world, cinema soundtracks, and electronic cuts with zero ads.",
			[]string{"jazz", "world", "electronic"}, "aac", 192000, "https://icecast.radiofrance.fr/fip-hifi.aac"),
		mk("somafm-groove", "SomaFM Groove Salad", "US", "San Francisco, USA",
			"A nicely chilled plate of ambient/downtempo beats and grooves broadcasting listener-supported from San Francisco.",
			[]string{"ambient", "downtempo", "electronic"}, "aac", 128000, "https://ice1.somafm.com/groovesalad-128-aac"),
		mk("nts-1", "NTS Radio 1", "GB", "London, UK",
			"Don't Assume. 24/7 underground radio featuring guest selectors, rare jazz, dub, post-punk, and club transmissions.",
			[]string{"electronic", "indie", "jazz"}, "mp3", 192000, "https://stream-relay-geo.ntslive.net/stream"),
		mk("swiss-jazz", "Radio Swiss Jazz", "CH", "Basel, Switzerland",
			"Classic and contemporary jazz, soul, and blues curated around the clock with crystal-clear Swiss broadcast audio.",
			[]string{"jazz", "soul", "blues"}, "aac", 128000, "https://stream.srg-ssr.ch/m/rsj/aacp_96"),
		mk("radio-paradise", "Radio Paradise Mellow Mix", "US", "California, USA",
			"Listener-supported eclectic blend of indie, jazz, ambient, and acoustic treasures hand-mixed by human DJs.",
			[]string{"indie", "ambient", "rock"}, "flac", 320000, "https://stream.radioparadise.com/mellow-320"),
		mk("dublab", "dublab", "US", "Los Angeles, USA",
			"Non-profit web radio collective dedicated to the growth of positive music, arts, and culture since 1999.",
			[]string{"electronic", "experimental", "jazz"}, "mp3", 256000, "https://dublab.out.airtime.pro/dublab_a"),
		mk("flux-fm", "FluxFM Klubradio", "DE", "Berlin, Germany",
			"Berlin's alternative cultural transmitter — indie, electro, club culture, and late-night sessions.",
			[]string{"electronic", "indie"}, "mp3", 192000, "https://streams.fluxfm.de/klubradio/mp3-320"),
		mk("worldwide-fm", "Worldwide FM", "GB", "London, UK",
			"Global music community founded by Gilles Peterson celebrating underground jazz, broken beat, and global grooves.",
			[]string{"jazz", "world", "soul"}, "mp3", 192000, "https://worldwidefm.out.airtime.pro/worldwidefm_a"),
		mk("somafm-drone", "SomaFM Drone Zone", "US", "San Francisco, USA",
			"Served best chilled, safe with most medications. Atmospheric textures with minimal beats for deep focus.",
			[]string{"ambient", "drone"}, "aac", 128000, "https://ice1.somafm.com/dronezone-128-aac"),
		mk("kexp", "KEXP 90.3 FM", "US", "Seattle, USA",
			"Where the music matters — live in-studio performances, indie discoveries, jazz, and global crate-digging.",
			[]string{"indie", "rock", "world"}, "aac", 160000, "https://kexp.streamguys1.com/kexp160.aac"),
		mk("tsf-jazz", "TSF Jazz", "FR", "Paris, France",
			"24-hour Paris jazz institution spinning bebop, modal classics, and live club recordings.",
			[]string{"jazz"}, "mp3", 128000, "https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3"),
		mk("rtr-fm", "RTRFM 92.1", "AU", "Perth, Australia",
			"Independent community radio championing local sounds, late-night electronics, and global jazz.",
			[]string{"indie", "electronic", "jazz"}, "mp3", 128000, "https://live.rtrfm.com.au/stream1"),
	}

	health := map[string]nostrclient.StationHealth{
		stations[0].Address:  {StationAddress: stations[0].Address, Status: "up", Score: 99, LatencyMs: 42},
		stations[1].Address:  {StationAddress: stations[1].Address, Status: "up", Score: 98, LatencyMs: 68},
		stations[2].Address:  {StationAddress: stations[2].Address, Status: "up", Score: 96, LatencyMs: 55},
		stations[3].Address:  {StationAddress: stations[3].Address, Status: "up", Score: 99, LatencyMs: 38},
		stations[4].Address:  {StationAddress: stations[4].Address, Status: "up", Score: 97, LatencyMs: 74},
		stations[5].Address:  {StationAddress: stations[5].Address, Status: "up", Score: 95, LatencyMs: 89},
		stations[6].Address:  {StationAddress: stations[6].Address, Status: "up", Score: 97, LatencyMs: 31},
		stations[7].Address:  {StationAddress: stations[7].Address, Status: "degraded", Score: 74, LatencyMs: 210},
		stations[8].Address:  {StationAddress: stations[8].Address, Status: "up", Score: 99, LatencyMs: 61},
		stations[9].Address:  {StationAddress: stations[9].Address, Status: "up", Score: 98, LatencyMs: 82},
		stations[10].Address: {StationAddress: stations[10].Address, Status: "up", Score: 96, LatencyMs: 49},
		stations[11].Address: {StationAddress: stations[11].Address, Status: "up", Score: 94, LatencyMs: 144},
	}

	tracks := map[string]nostrclient.StationTrack{
		stations[0].Address: {StationAddress: stations[0].Address, Artist: "Miles Davis", Song: "Blue in Green"},
		stations[1].Address: {StationAddress: stations[1].Address, Artist: "Tycho", Song: "Awake"},
		stations[3].Address: {StationAddress: stations[3].Address, Artist: "Bill Evans Trio", Song: "Waltz for Debby"},
	}

	return stations, health, tracks
}

func main() {
	// Force full 24-bit TrueColor ANSI output even when stdout is a pipe.
	lipgloss.SetColorProfile(termenv.TrueColor)
	lipgloss.SetHasDarkBackground(true)

	tmpDir, err := os.MkdirTemp("", "wf-teaser-*")
	if err != nil {
		fmt.Fprintf(os.Stderr, "mktemp: %v\n", err)
		os.Exit(1)
	}
	defer os.RemoveAll(tmpDir)
	_ = os.Setenv("WF_CONFIG_DIR", tmpDir)
	_ = os.Setenv("WF_DISABLE_KEYRING", "1")

	allStations, health, tracks := demoStations()

	app := ui.NewApp(ui.LaunchOptions{
		RelayOverride: "wss://relay.wavefunc.live",
		Version:       "0.1.12",
	})
	defer app.Cleanup()

	const cols, rows = 114, 30
	app.Update(tea.WindowSizeMsg{Width: cols, Height: rows})
	app.DemoSeed(40258, allStations, health, tracks)

	enc := json.NewEncoder(os.Stdout)
	frameIdx := 0
	isPaper := false

	emit := func(count int) {
		for i := 0; i < count; i++ {
			app.DemoStepFrame()
			themeName := "dark"
			if isPaper {
				themeName = "light"
			}
			_ = enc.Encode(frameRecord{
				Frame: frameIdx,
				Theme: themeName,
				ANSI:  app.View(),
			})
			frameIdx++
		}
	}

	// 1. Onboarding Step 1: Signal Check + big 18x9 3D Braille cube (2.6s = 52 frames)
	emit(52)

	// 2. Onboarding Step 2: Tune In — switch vibe, tune FIP Radio (2.4s = 48 frames)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyEnter})
	emit(14)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyDown})
	emit(6)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyUp})
	emit(4)
	// Start tuning FIP Radio -> locks on air!
	app.DemoSetPlayback(player.StatusTuning, &allStations[0], player.TrackInfo{})
	emit(10)
	app.DemoSetPlayback(player.StatusPlaying, &allStations[0], player.TrackInfo{
		Raw:    "Miles Davis - Blue in Green",
		Artist: "Miles Davis",
		Song:   "Blue in Green",
		Source: "icy",
	})
	emit(14)

	// 3. Main TRANSMIT directory with enlarged 12x5 3D cube in Now Playing Dock (2.5s = 50 frames)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyEsc})
	emit(18)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyDown})
	emit(8)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyDown})
	emit(8)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyDown})
	emit(16)

	// 4. Live NIP-50 Search: press '/', type "jazz", select Radio Swiss Jazz & tune in (2.6s = 52 frames)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("/")})
	emit(5)
	for _, partial := range []string{"j", "ja", "jaz", "jazz"} {
		app.DemoApplySearchFilter(allStations, partial)
		emit(5)
	}
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyEsc})
	emit(4)
	// Move down to Radio Swiss Jazz (index 2 in jazz-filtered list: FIP, NTS, Swiss Jazz)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyDown})
	emit(4)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyDown})
	emit(4)
	app.DemoSetPlayback(player.StatusTuning, &allStations[3], player.TrackInfo{})
	emit(8)
	app.DemoSetPlayback(player.StatusPlaying, &allStations[3], player.TrackInfo{
		Raw:    "Bill Evans Trio - Waltz for Debby",
		Artist: "Bill Evans Trio",
		Song:   "Waltz for Debby",
		Source: "icy",
	})
	app.DemoSetToast("★ Tuned into Radio Swiss Jazz")
	emit(12)
	app.DemoSetToast("")

	// 5. Open Station Inspector & NIP-22 Comments Drawer (2.0s = 40 frames)
	app.DemoOpenInspector(allStations[3], 24, []ui.DemoComment{
		{Author: "vinyl_nomad", Text: "Late-night modal jazz heaven. Zero ads, super crisp AAC stream.", MinutesAgo: 18, Depth: 0},
		{Author: "nostr_tuner", Text: "Synced straight to my favorites across terminal & phone!", MinutesAgo: 7, Depth: 1},
		{Author: "fip_enjoyer", Text: "Just saved Waltz for Debby to my Crate with [s].", MinutesAgo: 2, Depth: 0},
	})
	emit(40)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyEsc})
	app.DemoApplySearchFilter(allStations, "")
	emit(8)

	// 6. Toggle Constructivist Paper Light theme and back to Sonic Dark (2.2s = 44 frames)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("t")})
	isPaper = true
	emit(28)
	app.DemoSendKey(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("t")})
	isPaper = false
	emit(16)
}
