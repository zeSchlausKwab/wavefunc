package main

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"

	"fiatjaf.com/nostr"
	"fiatjaf.com/nostr/eventstore/codec/betterbinary"
	"fiatjaf.com/nostr/nip40"
	"github.com/PowerDNS/lmdb-go/lmdb"
)

// The relay's eventstore indexes kind + created_at with duplicate values for
// events at the same second. Walk its index and raw records in one read
// transaction, so concurrent replacements and deletions cannot split the view.
func exportStationSnapshot(path string, output io.Writer) error {
	env, err := lmdb.NewEnv()
	if err != nil {
		return err
	}
	defer env.Close()
	if err := env.SetMaxDBs(12); err != nil {
		return err
	}
	if err := env.Open(path, lmdb.Readonly, 0); err != nil {
		return fmt.Errorf("open station database %q: %w", path, err)
	}

	writer := bufio.NewWriterSize(output, 64*1024)
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	err = env.View(func(txn *lmdb.Txn) error {
		txn.RawRead = true
		kindIndex, err := txn.OpenDBI("kind", 0)
		if err != nil {
			return err
		}
		rawStore, err := txn.OpenDBI("raw", 0)
		if err != nil {
			return err
		}
		cursor, err := txn.OpenCursor(kindIndex)
		if err != nil {
			return err
		}
		defer cursor.Close()

		prefix := binary.BigEndian.AppendUint16(nil, uint16(indexedKind))
		now := nostr.Now()
		for key, serial, err := cursor.Get(prefix, nil, lmdb.SetRange); ; key, serial, err = cursor.Get(nil, nil, lmdb.Next) {
			if lmdb.IsNotFound(err) {
				return nil
			}
			if err != nil {
				return err
			}
			if !bytes.HasPrefix(key, prefix) {
				return nil
			}
			if len(key) != 6 || len(serial) != 4 {
				return fmt.Errorf("invalid station index entry %x", key)
			}
			data, err := txn.Get(rawStore, serial)
			if err != nil {
				return fmt.Errorf("read station record %x: %w", serial, err)
			}
			var event nostr.Event
			if err := betterbinary.Unmarshal(data, &event); err != nil {
				return fmt.Errorf("decode station record %x: %w", serial, err)
			}
			if event.Kind != indexedKind || uint32(event.CreatedAt) != binary.BigEndian.Uint32(key[2:]) || !event.CheckID() || !event.VerifySignature() {
				return fmt.Errorf("invalid station record %x", serial)
			}
			if expiry := nip40.GetExpiration(event.Tags); expiry != -1 && expiry <= now {
				continue
			}
			if err := encoder.Encode(event); err != nil {
				return err
			}
		}
	})
	if err != nil {
		return err
	}
	return writer.Flush()
}
