import { useState } from "react";
import { use$ } from "applesauce-react/hooks";
import {
  useAccountOptions,
  setAccountOptions,
} from "../../config/accountOptions";
import { listeningStatusError } from "../../lib/nostr/hooks/useListeningStatus";
export function ListeningSettings({ pubkey }: { pubkey: string }) {
  const options = useAccountOptions(pubkey);
  const publishError = use$(listeningStatusError);
  const [error, setError] = useState("");
  return (
    <section className="space-y-2 border-2 border-on-background p-4">
      <label className="flex items-center gap-3 font-bold text-sm">
        <input
          type="checkbox"
          checked={options.listeningStatus}
          onChange={(e) => {
            try {
              setAccountOptions(pubkey, { listeningStatus: e.target.checked });
              setError("");
            } catch {
              setError("Could not save this preference.");
            }
          }}
        />
        Share my listening status
      </label>
      <p className="text-xs leading-relaxed text-on-background/60">
        Publish the current track and station publicly on Nostr for this
        account. Off by default. Pausing or turning this off clears the status;
        after closing the app or switching accounts it expires within five
        minutes. Your signer may ask for approval.
      </p>
      {(error || publishError) && (
        <p role="status" className="text-xs">
          {error || `Status could not be published: ${publishError}`}
        </p>
      )}
    </section>
  );
}
