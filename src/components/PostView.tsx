import type { Filter } from "applesauce-core/helpers/filter";
import { TimelineModel } from "applesauce-core/models";
import { useEventModel } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { useEffect, useMemo } from "react";
import { getAppDataRelayUrls } from "../config/nostr";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { MiniProfile } from "./MiniProfile";

export function PostView() {
  const { eventStore, relayPool } = useWavefuncNostr();

  const filters: Filter[] = useMemo(() => [{ kinds: [1], limit: 50 }], []);

  useEffect(() => {
    const subscription = relayPool
      .subscription(getAppDataRelayUrls(), filters)
      .pipe(storeEvents(eventStore))
      .subscribe();
    return () => subscription.unsubscribe();
  }, [eventStore, relayPool, filters]);

  const events = useEventModel(TimelineModel, [filters]) ?? [];

  return (
    <div>
      {events.map((event) => (
        <Card
          key={event.id}
          className="bg-card/50 backdrop-blur-sm border-muted"
        >
          <CardHeader>
            <CardTitle>
              <MiniProfile userOrPubkey={event.pubkey} />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p>{event.content}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
