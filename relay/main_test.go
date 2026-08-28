package main

import (
	"context"
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
