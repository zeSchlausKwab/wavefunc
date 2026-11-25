package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"

	"fiatjaf.com/nostr"
	"fiatjaf.com/nostr/eventstore/lmdb"
)

func TestStationSnapshotUsesStoredRevisionsAndIncludesTimestampTies(t *testing.T) {
	path := t.TempDir()
	db := lmdb.LMDBBackend{Path: path, MapSize: 32 << 20}
	if err := db.Init(); err != nil {
		t.Fatal(err)
	}
	key := nostr.Generate()
	store := func(kind nostr.Kind, d string, ts nostr.Timestamp, tags ...nostr.Tag) nostr.Event {
		t.Helper()
		event := nostr.Event{Kind: kind, CreatedAt: ts, Tags: append(nostr.Tags{{"d", d}}, tags...)}
		if err := event.Sign(key); err != nil {
			t.Fatal(err)
		}
		if _, err := db.ReplaceEvent(event); err != nil {
			t.Fatal(err)
		}
		return event
	}
	want := make(map[nostr.ID]bool)
	for i := 0; i < 75; i++ {
		event := store(indexedKind, fmt.Sprintf("station-%d", i), 100, nostr.Tag{"c", "jazz", "genre"})
		want[event.ID] = true
	}
	store(indexedKind, "replaced", 8)
	updated := store(indexedKind, "replaced", 100)
	want[updated.ID] = true
	deleted := store(indexedKind, "deleted", 100)
	if err := db.DeleteEvent(deleted.ID); err != nil {
		t.Fatal(err)
	}
	store(indexedKind, "expired", 100, nostr.Tag{"expiration", "101"})
	store(31238, "non-station", 100)
	db.Close()

	var output bytes.Buffer
	if err := exportStationSnapshot(path, &output); err != nil {
		t.Fatal(err)
	}
	scanner := bufio.NewScanner(&output)
	for scanner.Scan() {
		var event nostr.Event
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			t.Fatal(err)
		}
		if !event.VerifySignature() || !want[event.ID] {
			t.Fatalf("unexpected station record %s", event.ID)
		}
		delete(want, event.ID)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if len(want) != 0 {
		t.Fatalf("snapshot omitted %d current stations", len(want))
	}
	if err := exportStationSnapshot(path, brokenWriter{}); !errors.Is(err, io.ErrClosedPipe) {
		t.Fatalf("output failure must fail the entire export: %v", err)
	}
}

type brokenWriter struct{}

func (brokenWriter) Write([]byte) (int, error) { return 0, io.ErrClosedPipe }

func TestStationSnapshotRejectsUnavailableDatabaseAndInvalidRecord(t *testing.T) {
	path := filepath.Join(t.TempDir(), "events")
	if err := exportStationSnapshot(path, io.Discard); err == nil {
		t.Fatal("missing database was reported as a complete snapshot")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("export created a missing database")
	}
	db := lmdb.LMDBBackend{Path: path, MapSize: 32 << 20}
	if err := db.Init(); err != nil {
		t.Fatal(err)
	}
	event := nostr.Event{Kind: indexedKind, CreatedAt: 1, Tags: nostr.Tags{{"d", "bad"}}}
	event.SetID()
	if err := db.SaveEvent(event); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if err := exportStationSnapshot(path, io.Discard); err == nil {
		t.Fatal("invalid signature was reported as a complete snapshot")
	}
}
