import { NDKKind, useSubscribe } from "@nostr-dev-kit/react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { MiniProfile } from "./MiniProfile";

export function PostView() {
  const { events, eose } = useSubscribe([{ kinds: [NDKKind.Text], limit: 50 }]);

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
