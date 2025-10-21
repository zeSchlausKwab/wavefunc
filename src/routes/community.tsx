import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/community")({
  component: Community,
});

function Community() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Community</h1>
    </div>
  );
}
