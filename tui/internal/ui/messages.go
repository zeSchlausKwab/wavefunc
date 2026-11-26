package ui

import (
	"time"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/auth"
	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/player"
)

type tickMsg time.Time

type playerSnapMsg player.Snapshot

type relayWarmMsg struct {
	err error
}

type stationCountMsg struct {
	count int
	err   error
}

type stationsLoadedMsg struct {
	seq      uint64
	stations []nostrclient.Station
	err      error
	autoPlay bool
}

type discoverLoadedMsg struct {
	bundle   nostrclient.DiscoverBundle
	err      error
	autoPlay bool
}

type healthLoadedMsg struct {
	health map[string]nostrclient.StationHealth
	tracks map[string]nostrclient.StationTrack
}

type userListsLoadedMsg struct {
	bundle nostrclient.UserListsBundle
	err    error
}

type signalsLoadedMsg struct {
	songs []nostrclient.Song
	err   error
}

type stationSocialLoadedMsg struct {
	social nostrclient.StationSocial
	err    error
}

type assemblyLoadedMsg struct {
	posts  []nostrclient.CommunityPost
	append bool
	err    error
}

type searchDebounceMsg struct {
	seq   uint64
	query string
}

type actionResultMsg struct {
	toast       string
	isErr       bool
	reloadLists bool
	reloadFeed  bool
	reloadSoc   *nostrclient.Station
}

type authSessionMsg struct {
	session      auth.Session
	isNewAccount bool
	backupNsec   string
	err          error
}

type nostrConnectPreparedMsg struct {
	pairing *auth.NostrConnectPairing
	qrArt   string
	qrCols  int
	qrRows  int
	err     error
}

type nostrConnectCompletedMsg struct {
	session *auth.BunkerSession
	err     error
}

type clearToastMsg struct {
	id uint64
}
