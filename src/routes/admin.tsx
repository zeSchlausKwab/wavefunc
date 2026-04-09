import { createFileRoute } from "@tanstack/react-router";
import { isAdmin } from "../config/admins";
import { AdminDashboard } from "../components/admin/AdminDashboard";
import { useCurrentAccount } from "../lib/nostr/auth";

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
});

function AdminRoute() {
  const currentUser = useCurrentAccount();

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <span className="material-symbols-outlined text-6xl text-on-background/20">
          lock
        </span>
        <p className="font-black uppercase tracking-tight text-on-background/40">
          LOGIN_REQUIRED
        </p>
      </div>
    );
  }

  if (!isAdmin(currentUser.pubkey)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <span className="material-symbols-outlined text-6xl text-on-background/20">
          block
        </span>
        <p className="font-black uppercase tracking-tight text-on-background/40">
          ACCESS_DENIED
        </p>
      </div>
    );
  }

  return <AdminDashboard />;
}
