package ui

import (
	"time"

	"fiatjaf.com/nostr"
	tea "github.com/charmbracelet/bubbletea"

	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/player"
)

// DemoSeed populates deterministic showcase data for teaser video capture
// without opening external audio processes or network sockets.
func (m *AppModel) DemoSeed(
	stationCount int,
	stations []nostrclient.Station,
	health map[string]nostrclient.StationHealth,
	tracks map[string]nostrclient.StationTrack,
) {
	m.stationCount = stationCount
	m.stations = stations
	m.featuredStations = stations
	for _, st := range stations {
		m.stationByAddr[st.Address] = st
	}
	m.transmit.loading = false

	// Seed player backend indicator cleanly for the showcase.
	m.playerSnap.Backend = player.BackendInfo{Kind: player.BackendMPV, Path: "/opt/homebrew/bin/mpv"}
	m.playerSnap.Volume = 82

	// Seed cached health & tracks on the client by ingesting synthetic events.
	_ = health
	_ = tracks
	m.nostr.SeedDemoCache(health, tracks)
}

// DemoStepFrame advances the animation clock by one 20 FPS frame.
func (m *AppModel) DemoStepFrame() {
	m.animator.Step(m.playerSnap.Status, m.playerSnap.Muted)
}

// DemoSetPlayback sets playback state & live ICY metadata directly without spawning audio.
func (m *AppModel) DemoSetPlayback(status player.Status, st *nostrclient.Station, track player.TrackInfo) {
	if st != nil {
		cp := *st
		m.playerSnap.Station = &cp
		m.animator.Retune(cp.Address + cp.Name)
	}
	m.playerSnap.Status = status
	m.playerSnap.Track = track
}

// DemoOpenInspector opens the station inspector populated with sample social interactions.
func (m *AppModel) DemoOpenInspector(st nostrclient.Station, reactions int, comments []DemoComment) {
	m.overlay = overlayStationDrawer
	m.drawer.station = st
	m.drawer.loading = false
	m.drawer.focusComments = false
	m.drawer.streamCursor = 0
	m.drawer.commentCursor = 0

	var nodes []*nostrclient.CommentNode
	now := time.Now().Unix()
	for i, c := range comments {
		sk := nostr.Generate()
		pk := sk.Public()
		m.nostr.SetProfile(nostrclient.Profile{
			PubKey:      pk.Hex(),
			Name:        c.Author,
			DisplayName: c.Author,
		})
		ev := nostr.Event{
			ID:        nostr.ID{byte(i + 1)},
			PubKey:    pk,
			CreatedAt: nostr.Timestamp(now - int64(c.MinutesAgo*60)),
			Kind:      nostrclient.KindComment,
			Content:   c.Text,
		}
		nodes = append(nodes, &nostrclient.CommentNode{
			Event: ev,
			Depth: c.Depth,
		})
	}
	m.drawer.social = nostrclient.StationSocial{
		StationAddress: st.Address,
		ReactionCount:  reactions,
		UserReacted:    true,
		Comments:       nodes,
		FlatComments:   nodes,
	}
}

type DemoComment struct {
	Author     string
	Text       string
	MinutesAgo int
	Depth      int
}

// DemoSetToast displays a toast message in the dock.
func (m *AppModel) DemoSetToast(text string) {
	m.toastText = text
	m.toastErr = false
}

// DemoSendKey injects a Bubble Tea key message directly into Update.
func (m *AppModel) DemoSendKey(msg tea.KeyMsg) {
	m.Update(msg)
}

// DemoApplySearchFilter filters m.stations locally using WaveFunc's Bleve-compatible matcher.
func (m *AppModel) DemoApplySearchFilter(all []nostrclient.Station, query string) {
	m.transmit.searchInput.SetValue(query)
	var out []nostrclient.Station
	for _, st := range all {
		if nostrclient.MatchesStationSearch(st, query) {
			out = append(out, st)
		}
	}
	m.stations = out
	m.transmit.cursor = 0
	m.transmit.scroll = 0
}
