import { useEffect, useState } from "react";
import { use$ } from "applesauce-react/hooks";
import { MailboxesFactory } from "applesauce-core/factories";
import { getInboxes, getOutboxes } from "applesauce-core/helpers/mailboxes";
import { Relay } from "applesauce-relay";
import { firstValueFrom } from "rxjs";
import { useWavefuncNostr } from "@/lib/nostr/runtime";
import { relayLiveness } from "@/lib/nostr/store";
import { getRelayPolicy } from "@/config/nostr";
import { normalizePersonalRelays, relayPreferences, type PersonalRelay } from "@/config/relayPreferences";

function RelayHealth({ url }: { url: string }) {
  const { relayPool } = useWavefuncNostr();
  const statuses = use$(relayPool.status$);
  const health = use$(() => relayLiveness.state(url), [url]);
  const [detail, setDetail] = useState("");
  const [checking, setChecking] = useState(false);
  const status = statuses?.[url] ?? statuses?.[`${url}/`];
  const retry = async () => {
    setChecking(true);
    setDetail("");
    relayLiveness.reset(url);
    try {
      await firstValueFrom(relayPool.request([url], [{ kinds: [10002], limit: 1 }], { waitForAuth: false }), { defaultValue: null });
      setDetail("Relay answered the request.");
    } catch (error) { setDetail(error instanceof Error ? error.message : String(error)); }
    finally { setChecking(false); }
  };
  const information = async () => {
    setChecking(true);
    try {
      const info = await Relay.fetchInformationDocument(url);
      setDetail(info ? `${info.name ?? "Relay"} · NIPs: ${(info.supported_nips ?? []).join(", ") || "not advertised"}` : "No public relay information available.");
    } catch { setDetail("Could not retrieve relay information."); }
    finally { setChecking(false); }
  };
  return <div className="text-xs space-y-1">
    <div className="flex gap-3 items-center flex-wrap">
      <span className={status?.connected ? "text-green-600" : "text-on-background/60"}>
        {status?.connected ? "Connected" : health?.state === "dead" ? "Unavailable" : health?.state === "offline" ? "Offline / retry delayed" : status ? "Disconnected" : "Not contacted"}
        {status?.authenticated ? " · authenticated" : ""}
      </span>
      <button className="underline" disabled={checking} onClick={retry}>Retry</button>
      <button className="underline" disabled={checking} onClick={information}>Relay info</button>
    </div>
    {detail && <p role="status" className="break-words">{detail}</p>}
  </div>;
}

export function RelaysSettings() {
  const { currentPubkey, eventStore, signAndPublish } = useWavefuncNostr();
  const preferences = use$(relayPreferences.state$);
  const policy = getRelayPolicy();
  const [draft, setDraft] = useState<PersonalRelay[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const mailbox = currentPubkey && eventStore.getReplaceable(10002, currentPubkey);
    const reads = mailbox ? getInboxes(mailbox) : policy.generalRead;
    const writes = mailbox ? getOutboxes(mailbox) : policy.generalWriteFallback;
    setDraft(preferences?.relays ?? [...new Set([...reads, ...writes])].map(url => ({ url, read: reads.includes(url), write: writes.includes(url) })));
  }, [preferences, currentPubkey, eventStore]);
  useEffect(() => setMessage(""), [currentPubkey]);
  const edit = (action: () => void) => {
    try { action(); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const publish = async () => {
    setBusy(true);
    try {
      const relays = normalizePersonalRelays(draft);
      if (!relays.some(r => r.read) || !relays.some(r => r.write)) throw new Error("Keep a read relay and a write relay");
      const old = currentPubkey && eventStore.getReplaceable(10002, currentPubkey);
      const factory = old ? MailboxesFactory.modify({ ...old, kind: 10002 }) : MailboxesFactory.create();
      const template = await factory.inboxes(relays.filter(r => r.read).map(r => r.url)).outboxes(relays.filter(r => r.write).map(r => r.url));
      // Announce to both old and new outboxes so existing contacts can find the change.
      const targets = policy.stage === "development" ? policy.appData : [...new Set([...policy.identityRead, ...(old ? getOutboxes(old) : []), ...relays.filter(r => r.write).map(r => r.url)])];
      await signAndPublish(template, targets);
      setMessage("Public relay list published. Use Save on this device to apply these relays locally.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const fixed = [...new Set([...policy.appData, ...policy.identityRead, ...policy.walletRead])];
  return <div className="space-y-6">
    <h3 className="text-base font-black uppercase border-b-4 border-on-background pb-3">Relays</h3>
    <p className="text-sm">Personal relays are saved for this account on this device. Publishing your relay list shares it with other Nostr clients.</p>
    {policy.stage === "development" && <p className="text-sm">Development content stays on the local app relay. Personal preferences take effect for content in production.</p>}
    <fieldset disabled={!currentPubkey || busy} className="space-y-3 disabled:opacity-60">
      <legend className="font-bold mb-2">Personal relays</legend>
      {!currentPubkey && <p>Sign in to edit your relays.</p>}
      {draft.map((relay, index) => <div key={relay.url} className="border-2 border-on-background p-3 space-y-2">
        <code className="text-xs break-all">{relay.url}</code>
        <div className="flex gap-4 text-sm">
          {(["read", "write"] as const).map(mode => <label key={mode} className="flex gap-1 items-center"><input type="checkbox" checked={relay[mode]} onChange={e => setDraft(rows => rows.map((row, i) => i === index ? { ...row, [mode]: e.target.checked } : row))} />{mode}</label>)}
          <button onClick={() => setDraft(rows => rows.filter((_, i) => i !== index))}>Remove</button>
        </div>
        <RelayHealth url={relay.url} />
      </div>)}
      <div className="flex gap-2">
        <input aria-label="New relay URL" className="border-2 p-2 min-w-0 flex-1 bg-transparent" placeholder="wss://relay.example.com" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
        <button disabled={!newUrl} onClick={() => edit(() => { setDraft(normalizePersonalRelays([...draft, { url: newUrl, read: true, write: true }])); setNewUrl(""); })}>Add</button>
      </div>
      <div className="flex flex-wrap gap-4 text-sm underline">
        <button onClick={() => { try { relayPreferences.save(draft); setMessage("Saved on this device."); } catch (error) { setMessage(String(error)); } }}>Save on this device</button>
        <button onClick={() => edit(() => relayPreferences.save(null))}>Use defaults</button>
        <button onClick={publish}>Publish public relay list</button>
      </div>
    </fieldset>
    {message && <p role="status" className="text-sm break-words">{message}</p>}
    <details className="space-y-3">
      <summary className="cursor-pointer font-bold">App, profile and wallet relays</summary>
      <p className="text-sm">These relays serve specific data types and are managed by the app.</p>
      {fixed.map(url => <div key={url} className="border p-3 space-y-1"><code className="text-xs break-all">{url}</code><RelayHealth url={url} /></div>)}
    </details>
  </div>;
}
