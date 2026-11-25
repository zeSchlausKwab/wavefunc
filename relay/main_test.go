package main

import (
	"context"
	"encoding/json"
	"testing"

	"fiatjaf.com/nostr"
)

func TestEnvEnabled(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "empty", value: "", want: false},
		{name: "false", value: "false", want: false},
		{name: "zero", value: "0", want: false},
		{name: "true", value: "true", want: true},
		{name: "one", value: "1", want: true},
		{name: "yes mixed case", value: " YeS ", want: true},
		{name: "on", value: "on", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := envEnabled(tt.value); got != tt.want {
				t.Fatalf("envEnabled(%q) = %v, want %v", tt.value, got, tt.want)
			}
		})
	}
}

func TestSupportReceiptScope(t *testing.T) {
	t.Parallel()
	// Mainnet BOLT11 fixture from the Nostr library's nip60 invoice tests.
	const invoice = "lnbc50n1pne523ypp57rn4l2ne673c093g72nm4pum2mkxjm0v2c0pjc9je909axyutdlqdq2f38xy6t5wvcqzpgxqrrssrzjq0nfr7qlprzkl2rke380tj0gkunm66pv7dtqt0396jrq02qz2fs98apyqqqqqqqqqgqqqqqqqqqqqzsqxgsp5rgp9fa9d8unmg949ztty48dgptke8f8zflt7af8d4yknamp2ymdq9p4gqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqysgqmatchtjjsyvk45mwwg2mvf8xshxhk2gveslvc27dda6dkp0kfc3hhs06e3c966h3z9j9aran0q8ncm6n458xdca3j5nsrke4saxrfmsqu7suv5"
	sender, provider := nostr.Generate(), nostr.Generate()
	marked := nostr.Tags{{"L", supportNamespace}, {"l", "app-support", supportNamespace}}
	cases := []struct {
		name          string
		add           nostr.Tags
		requestAt     nostr.Timestamp
		receiptAt     nostr.Timestamp
		modifyRequest func(*nostr.Event)
		modifyReceipt func(*nostr.Event)
		allow         bool
	}{
		{name: "marked", add: marked, allow: true},
		{name: "legacy profile zap", requestAt: 1, receiptAt: 2, allow: true},
		{name: "unmarked after rollout"},
		{name: "old request observed after cutoff", requestAt: 1, receiptAt: legacyProfileZapCutoff},
		{name: "old receipt with newer request", requestAt: legacyProfileZapCutoff, receiptAt: 2},
		{name: "legacy post zap", requestAt: 1, receiptAt: 2, add: nostr.Tags{{"e", "post"}}},
		{name: "wrong namespace", add: nostr.Tags{{"L", supportNamespace}, {"l", "app-support", "other"}}},
		{name: "ambiguous recipient", add: append(marked.Clone(), nostr.Tag{"p", "other"})},
		{name: "wrong provider for request", add: append(marked.Clone(), nostr.Tag{"P", "other"})},
		{name: "tampered request", add: marked, modifyRequest: func(e *nostr.Event) { e.Content = "changed" }},
		{name: "unsigned request", add: marked, modifyRequest: func(e *nostr.Event) { e.Sig = [64]byte{} }},
		{name: "wrong receipt recipient", add: marked, modifyReceipt: func(e *nostr.Event) { e.Tags[0][1] = "other" }},
		{name: "invalid description", add: marked, modifyReceipt: func(e *nostr.Event) { e.Tags[2][1] = "{}" }},
		{name: "invalid invoice", add: marked, modifyReceipt: func(e *nostr.Event) { e.Tags[3][1] = "lnbc1invalid" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.requestAt == 0 {
				tc.requestAt = legacyProfileZapCutoff + 1
			}
			if tc.receiptAt == 0 {
				tc.receiptAt = legacyProfileZapCutoff + 2
			}
			request := nostr.Event{Kind: 9734, CreatedAt: tc.requestAt,
				Tags: append(nostr.Tags{{"p", supportPubKey}, {"relays", "wss://relay.example"}}, tc.add...)}
			if err := request.Sign(sender); err != nil {
				t.Fatal(err)
			}
			if tc.modifyRequest != nil {
				tc.modifyRequest(&request)
			}
			description, err := json.Marshal(request)
			if err != nil {
				t.Fatal(err)
			}
			receipt := nostr.Event{Kind: 9735, CreatedAt: tc.receiptAt, Tags: nostr.Tags{
				{"p", supportPubKey}, {"P", request.PubKey.Hex()}, {"description", string(description)}, {"bolt11", invoice},
			}}
			if tc.modifyReceipt != nil {
				tc.modifyReceipt(&receipt)
			}
			if err := receipt.Sign(provider); err != nil {
				t.Fatal(err)
			}
			reject, reason := rejectPublicEvent(nostr.PubKey{})(context.Background(), receipt)
			if reject == tc.allow {
				t.Fatalf("allowed: %v, want %v (%s)", !reject, tc.allow, reason)
			}
		})
	}
}

func TestRejectPublicFilter(t *testing.T) {
	t.Parallel()

	metadataAuthor := nostr.PubKey{1}
	stationAddresses := make([]string, 200)
	for i := range stationAddresses {
		stationAddresses[i] = "31237:catalog:station"
	}

	tests := []struct {
		name   string
		filter nostr.Filter
		reject bool
	}{
		{name: "empty", filter: nostr.Filter{}, reject: true},
		{name: "since only", filter: nostr.Filter{Since: 1}, reject: true},
		{name: "unrelated public notes", filter: nostr.Filter{Kinds: []nostr.Kind{0}}, reject: true},
		{name: "unrelated ephemeral traffic", filter: nostr.Filter{Kinds: []nostr.Kind{20000}}, reject: true},
		{name: "station catalog", filter: nostr.Filter{Kinds: []nostr.Kind{31237}, Limit: 500}},
		{name: "station search", filter: nostr.Filter{Kinds: []nostr.Kind{31237}, Search: "ambient", Limit: 100}},
		{name: "broad text notes", filter: nostr.Filter{Kinds: []nostr.Kind{1}, Limit: 50}, reject: true},
		{name: "wavefunc community", filter: nostr.Filter{Kinds: []nostr.Kind{1}, Tags: nostr.TagMap{"t": {"wavefunc"}}, Limit: 100}},
		{name: "health by station", filter: nostr.Filter{Kinds: []nostr.Kind{31238}, Authors: []nostr.PubKey{metadataAuthor}, Tags: nostr.TagMap{"a": stationAddresses}}},
		{name: "too many station targets", filter: nostr.Filter{Kinds: []nostr.Kind{31238}, Authors: []nostr.PubKey{metadataAuthor}, Tags: nostr.TagMap{"a": append(stationAddresses, "31237:catalog:overflow")}}, reject: true},
		{name: "targeted contextvm", filter: nostr.Filter{Kinds: []nostr.Kind{1059, 21059, 25910}, Since: nostr.Now() - 60, Tags: nostr.TagMap{"p": {"client"}}, Limit: 100}},
		{name: "broad contextvm", filter: nostr.Filter{Kinds: []nostr.Kind{1059}, Since: nostr.Now() - 60}, reject: true},
		{name: "ids only", filter: nostr.Filter{IDs: []nostr.ID{{1}, {2}}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, _ := rejectPublicFilter(context.Background(), tt.filter)
			if got != tt.reject {
				t.Fatalf("rejectPublicFilter() = %v, want %v", got, tt.reject)
			}
		})
	}
}

func TestRejectPublicEvent(t *testing.T) {
	t.Parallel()

	metadataAuthor := nostr.PubKey{1}
	otherAuthor := nostr.PubKey{2}
	tests := []struct {
		name   string
		event  nostr.Event
		reject bool
	}{
		{name: "station", event: nostr.Event{Kind: 31237, PubKey: otherAuthor}},
		{name: "unrelated profile", event: nostr.Event{Kind: 0, PubKey: otherAuthor}, reject: true},
		{name: "arbitrary app data", event: nostr.Event{Kind: 30078, PubKey: otherAuthor, Tags: nostr.Tags{{"l", "other-app"}}}, reject: true},
		{name: "favorites", event: nostr.Event{Kind: 30078, PubKey: otherAuthor, Tags: nostr.Tags{{"l", "wavefunc_user_favourite_list"}}}},
		{name: "community note", event: nostr.Event{Kind: 1, PubKey: otherAuthor, Tags: nostr.Tags{{"t", "wavefunc"}}}},
		{name: "generic note", event: nostr.Event{Kind: 1, PubKey: otherAuthor}, reject: true},
		{name: "station reaction", event: nostr.Event{Kind: 7, PubKey: otherAuthor, Tags: nostr.Tags{{"a", "31237:catalog:station"}}}},
		{name: "generic reaction", event: nostr.Event{Kind: 7, PubKey: otherAuthor, Tags: nostr.Tags{{"e", "unknown"}}}, reject: true},
		{name: "health by observer", event: nostr.Event{Kind: 31238, PubKey: metadataAuthor}},
		{name: "health by anyone", event: nostr.Event{Kind: 31238, PubKey: otherAuthor}, reject: true},
		{name: "targeted contextvm", event: nostr.Event{Kind: 1059, PubKey: otherAuthor, Tags: nostr.Tags{{"p", "client"}}}},
		{name: "untargeted contextvm", event: nostr.Event{Kind: 1059, PubKey: otherAuthor}, reject: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, _ := rejectPublicEvent(metadataAuthor)(context.Background(), tt.event)
			if got != tt.reject {
				t.Fatalf("rejectPublicEvent() = %v, want %v", got, tt.reject)
			}
		})
	}
}

func TestRejectPublicCount(t *testing.T) {
	t.Parallel()

	if reject, _ := rejectPublicCount(context.Background(), nostr.Filter{Kinds: []nostr.Kind{31237}}); reject {
		t.Fatal("station count should be allowed")
	}
	if reject, _ := rejectPublicCount(context.Background(), nostr.Filter{Kinds: []nostr.Kind{1}}); !reject {
		t.Fatal("non-station count should be rejected")
	}
}

func TestMetadataRepliesSurviveApplicationQueryQuota(t *testing.T) {
	policy := publicFilterRateLimitPolicy()
	ctx := context.Background()
	catalog := nostr.Filter{Kinds: []nostr.Kind{31237}, Limit: 100}
	for i := 0; i < 40; i++ {
		if reject, reason := policy(ctx, catalog); reject {
			t.Fatalf("initial catalog burst rejected: %s", reason)
		}
	}
	if reject, _ := policy(ctx, catalog); !reject {
		t.Fatal("catalog quota must remain bounded")
	}
	replies := nostr.Filter{Kinds: []nostr.Kind{25910, 1059, 21059}, Since: nostr.Now(), Tags: nostr.TagMap{"p": {"client"}}}
	if reject, reason := policy(ctx, replies); reject {
		t.Fatalf("catalog queries starved metadata replies: %s", reason)
	}
	for i := 1; i < 40; i++ {
		policy(ctx, replies)
	}
	if reject, _ := policy(ctx, replies); !reject {
		t.Fatal("metadata quota must also remain bounded")
	}
}
