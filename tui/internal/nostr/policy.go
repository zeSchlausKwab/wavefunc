package nostrclient

import (
	"net"
	"net/url"
	"slices"
	"strings"

	"fiatjaf.com/nostr"
)

type Stage string

const (
	StageProduction  Stage = "production"
	StageDevelopment Stage = "development"

	ProdAppRelay             = "wss://relay.wavefunc.live"
	ProdMetadataServerPubkey = "bb0707242a17a4be881919b3dcfea63f42aacedc3ff898a66be30af195ff32b2"
	DevMetadataServerPubkey  = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
	ProdAdminPubkey          = "210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2"
	DevAdminPubkey           = "86a82cab18b293f53cbaaae8cdcbee3f7ec427fdf9f9c933db77800bb5ef38a0"
)

var (
	DefaultGeneralRelays = []string{
		"wss://relay.primal.net",
		"wss://relay.damus.io",
		"wss://nos.lol",
		"wss://relay.nostr.net",
	}
	DefaultIdentityRelays = []string{
		"wss://purplepag.es",
		"wss://relay.nostr.band",
	}
	DefaultNIP46Relays = []string{
		"wss://relay.nsec.app",
		"wss://nos.lol",
	}
)

// RelayPolicy mirrors src/config/relayPolicy.ts so TUI reads and writes follow
// the exact same routing rules as the web/desktop client.
type RelayPolicy struct {
	Stage                Stage
	AppData              []string
	GeneralRead          []string
	GeneralWriteFallback []string
	IdentityRead         []string
	SocialRead           []string
}

func NormalizeRelayURL(raw string) string {
	return strings.TrimRight(strings.TrimSpace(raw), "/")
}

func UniqueRelays(relays ...[]string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, list := range relays {
		for _, r := range list {
			n := NormalizeRelayURL(r)
			if n == "" {
				continue
			}
			if _, ok := seen[n]; ok {
				continue
			}
			seen[n] = struct{}{}
			out = append(out, n)
		}
	}
	return out
}

// IsLocalRelayURL returns true for loopback or RFC1918 ws:// relays (development mode).
func IsLocalRelayURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "ws" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || host == "::1" {
		return true
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() {
		return true
	}
	return false
}

// NewRelayPolicy builds a stage-appropriate policy from the configured app relay.
func NewRelayPolicy(appRelay string) RelayPolicy {
	normalized := NormalizeRelayURL(appRelay)
	if normalized == "" {
		normalized = ProdAppRelay
	}
	stage := StageProduction
	if IsLocalRelayURL(normalized) {
		stage = StageDevelopment
	}
	if stage == StageDevelopment {
		return RelayPolicy{
			Stage:                stage,
			AppData:              []string{normalized},
			GeneralRead:          []string{normalized},
			GeneralWriteFallback: []string{normalized},
			IdentityRead:         []string{normalized},
			SocialRead:           []string{normalized},
		}
	}
	return RelayPolicy{
		Stage:                stage,
		AppData:              []string{normalized},
		GeneralRead:          UniqueRelays(DefaultGeneralRelays),
		GeneralWriteFallback: UniqueRelays(DefaultGeneralRelays),
		IdentityRead:         UniqueRelays(DefaultIdentityRelays, DefaultGeneralRelays),
		SocialRead:           UniqueRelays([]string{normalized}, DefaultGeneralRelays),
	}
}

func (p RelayPolicy) MetadataServerPubkey() string {
	if p.Stage == StageDevelopment {
		return DevMetadataServerPubkey
	}
	return ProdMetadataServerPubkey
}

func (p RelayPolicy) AdminPubkeys() []string {
	if p.Stage == StageDevelopment {
		return []string{DevAdminPubkey, ProdAdminPubkey}
	}
	return []string{ProdAdminPubkey}
}

func isWavefuncListEvent(evt nostr.Event) bool {
	if evt.Kind != KindAppList {
		return false
	}
	for _, tag := range evt.Tags {
		if len(tag) >= 2 && tag[0] == "l" &&
			(strings.HasPrefix(tag[1], "wavefunc_") || strings.HasPrefix(tag[1], "wavefunc:")) {
			return true
		}
	}
	return false
}

func isWavefuncSocialEvent(evt nostr.Event) bool {
	switch evt.Kind {
	case KindReaction, KindComment, KindReport, KindNutzap:
		return true
	case KindNote:
		for _, tag := range evt.Tags {
			if len(tag) < 2 {
				continue
			}
			if tag[0] == "t" && (tag[1] == "wavefunc" || tag[1] == "tunestr") {
				return true
			}
			if (tag[0] == "a" || tag[0] == "A") &&
				(strings.HasPrefix(tag[1], "31237:") ||
					strings.HasPrefix(tag[1], "31337:") ||
					strings.HasPrefix(tag[1], "30078:")) {
				return true
			}
		}
	}
	return false
}

func isAppDataDeletion(evt nostr.Event) bool {
	if evt.Kind != KindDeletion {
		return false
	}
	for _, tag := range evt.Tags {
		if len(tag) >= 2 && tag[0] == "k" && slices.Contains([]string{"31237", "31337", "30078"}, tag[1]) {
			return true
		}
		if len(tag) >= 2 && tag[0] == "a" &&
			(strings.HasPrefix(tag[1], "31237:") || strings.HasPrefix(tag[1], "31337:") || strings.HasPrefix(tag[1], "30078:")) {
			return true
		}
	}
	return false
}

// SelectPublishRelays routes each event to its compatible relays, ensuring
// WaveFunc-only events stay on the app relay and general/identity events never
// hit relay.wavefunc.live where they would be rejected.
func SelectPublishRelays(
	policy RelayPolicy,
	evt nostr.Event,
	authorOutboxes []string,
	recipientInboxes []string,
) []string {
	if policy.Stage == StageDevelopment {
		return slices.Clone(policy.AppData)
	}

	switch evt.Kind {
	case KindStation, KindStationHealth, KindStationNowPlaying, KindStationRanking, KindSong:
		return slices.Clone(policy.AppData)
	}
	if isWavefuncListEvent(evt) || isAppDataDeletion(evt) {
		return slices.Clone(policy.AppData)
	}

	outboxes := UniqueRelays(authorOutboxes)
	if len(outboxes) > 8 {
		outboxes = outboxes[:8]
	}
	inboxes := UniqueRelays(recipientInboxes)
	if len(inboxes) > 8 {
		inboxes = inboxes[:8]
	}
	authorTargets := outboxes
	if len(authorTargets) == 0 {
		authorTargets = policy.GeneralWriteFallback
	}

	if evt.Kind == KindProfile || evt.Kind == KindRelayList {
		return UniqueRelays(authorTargets, DefaultIdentityRelays)
	}

	if evt.Kind == KindListeningStatus {
		return UniqueRelays(authorTargets)
	}

	if isWavefuncSocialEvent(evt) {
		return UniqueRelays(policy.AppData, authorTargets, inboxes)
	}

	return UniqueRelays(authorTargets, inboxes)
}
