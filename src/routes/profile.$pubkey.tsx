import { createFileRoute, useRouter } from "@tanstack/react-router";
import { decodeProfilePointer } from "applesauce-core/helpers/pointers";
import { getProfileContent } from "applesauce-core/helpers/profile";
import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfile } from "../lib/nostr/auth";
import { loadDirectory } from "../lib/publicDirectory";
import { publicWebUrl } from "../lib/publicPageMetadata";
import { showToast } from "../stores/toastStore";

export const Route = createFileRoute("/profile/$pubkey")({
  loader: ({ params, abortController }) =>
    loadDirectory("/profile/" + encodeURIComponent(params.pubkey), abortController.signal),
  staleTime: 60_000,
  component: ProfilePage,
});

const labelClass = "text-[11px] font-bold uppercase tracking-widest text-on-background/65";

function profileText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function ProfilePage() {
  const { pubkey: param } = Route.useParams();
  const page = Route.useLoaderData();
  const router = useRouter();
  const pubkey = page.kind === "profile" ? page.pubkey : decodeProfilePointer(param)?.pubkey ?? (/^[a-f\d]{64}$/i.test(param) ? param.toLowerCase() : "");
  const liveProfile = useProfile(pubkey);
  const [failedBanner, setFailedBanner] = useState<string>();
  const profile = liveProfile ?? (page.kind === "profile" && page.event ? getProfileContent(page.event) : undefined);

  if (!profile && (page.kind === "not-found" || page.kind === "unavailable")) {
    return <main className="mx-auto max-w-4xl space-y-4 border-4 border-on-background bg-surface-container-low p-6">
      <h1 className="font-headline text-2xl font-bold">{page.kind === "not-found" ? "Profile not found" : "Profile temporarily unavailable"}</h1>
      {page.kind === "unavailable" && <button className="font-bold underline" onClick={() => router.invalidate()}>Try again</button>}
    </main>;
  }

  const displayName = profileText(profile?.display_name) || profileText(profile?.displayName) || profileText(profile?.name) || pubkey.slice(0, 12) || "Anonymous";
  const about = profileText(profile?.about);
  const nip05 = profileText(profile?.nip05);
  const banner = publicWebUrl(profile?.banner);
  const website = publicWebUrl(profile?.website);
  const lightning = profileText(profile?.lud16) || profileText(profile?.lud06);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(pubkey);
      showToast({ message: "Public key copied.", tone: "success" });
    } catch {
      showToast({ message: "Select the public key to copy it manually.", tone: "error" });
    }
  }

  return (
    <main className="mx-auto max-w-5xl border-4 border-on-background bg-surface shadow-[5px_5px_0_var(--foreground)]">
      <header>
        {banner && banner !== failedBanner && <div className="h-28 border-b-4 border-on-background bg-surface-variant sm:h-44 lg:h-52">
          <img src={banner} alt="" onError={() => setFailedBanner(banner)} className="block size-full object-cover" />
        </div>}
        <div className="flex items-center gap-4 bg-surface-container-low px-4 py-4 sm:gap-6 sm:px-6">
          <Avatar className="size-16 rounded-none border-2 border-on-background bg-surface sm:size-24">
            <AvatarImage src={publicWebUrl(profile?.picture) || publicWebUrl(profile?.image)} alt="" className="object-cover" />
            <AvatarFallback className="rounded-none bg-secondary-fixed-dim text-xl font-black sm:text-3xl">{Array.from(displayName).slice(0, 2).join("").toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className={labelClass}>Nostr profile</p>
            <h1 className="break-words font-headline text-3xl font-black leading-tight tracking-tight sm:text-5xl">{displayName}</h1>
            {nip05 && <p className="mt-1 break-all text-sm font-medium">{nip05}</p>}
          </div>
        </div>
      </header>

      <div className={about ? "grid border-t-4 border-on-background md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "border-t-4 border-on-background"}>
        {about && <section className="border-b-2 border-on-background p-4 sm:p-6 md:border-r-2 md:border-b-0">
          <h2 className={labelClass}>About</h2>
          <p className="mt-3 max-w-prose whitespace-pre-wrap break-words leading-relaxed">{about}</p>
        </section>}
        <dl className="min-w-0 divide-y-2 divide-on-background/20">
          {website && <div className="px-4 py-3 sm:px-6">
            <dt className={labelClass}>Website</dt>
            <dd><a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 break-all font-bold text-primary underline underline-offset-4">
              {website.replace(/^https?:\/\//, "")}<ExternalLink aria-hidden="true" className="size-4 shrink-0" />
            </a></dd>
          </div>}
          {lightning && <div className="px-4 py-3 sm:px-6">
            <dt className={labelClass}>Lightning address</dt>
            <dd className="mt-1 break-all text-sm font-medium">{lightning}</dd>
          </div>}
          <div className="px-4 py-3 sm:px-6">
            <dt className={labelClass}>Public key</dt>
            <dd className="mt-1 space-y-3">
              <code className="block select-all break-all text-sm">{pubkey}</code>
              <button type="button" onClick={copyKey} className="inline-flex min-h-9 items-center gap-2 border-2 border-on-background px-3 text-xs font-bold uppercase hover:bg-secondary-fixed-dim">
                <Copy aria-hidden="true" className="size-4" /> Copy key
              </button>
            </dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
