import { createFileRoute } from "@tanstack/react-router";
import { MusicBrainzSearch } from "@/components/MusicBrainzSearch";

export const Route = createFileRoute("/musicbrainz")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
    artist: typeof search.artist === "string" ? search.artist : undefined,
  }),
  component: MusicBrainzSearchPage,
});

function MusicBrainzSearchPage() {
  const { q, artist } = Route.useSearch();

  return (
    <div className="mb-24 space-y-6">
      <header className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="-skew-x-6 bg-on-background px-4 py-2 text-surface">
            <h1 className="skew-x-6 font-headline text-2xl font-black uppercase tracking-tighter sm:text-4xl md:text-6xl">
              SONG_LOOKUP
            </h1>
          </div>
          <div className="h-2 flex-1 bg-on-background" />
          <span className="hidden text-[10px] font-black uppercase tracking-[0.2em] text-primary lg:block">
            OPEN_MUSIC_CATALOG
          </span>
        </div>

        <p className="text-[10px] font-black uppercase leading-relaxed tracking-[0.15em] text-on-background/50 sm:text-xs">
          SEARCH_THE_CATALOG · SAVE_TO_CRATE · FORGE_TO_BLOSSOM ·
          SHARE_TO_NOSTR
        </p>
      </header>

      <div className="grid border-4 border-on-background bg-surface-container-high sm:grid-cols-3">
        <div className="flex gap-3 border-b-2 border-on-background p-3 sm:border-b-0 sm:border-r-2">
          <span className="font-headline text-2xl font-black text-primary">01</span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest">FIND_METADATA</p>
            <p className="mt-1 text-[9px] font-bold uppercase leading-relaxed text-on-background/45">
              Songs, albums, artists and labels via MusicBrainz.
            </p>
          </div>
        </div>
        <div className="flex gap-3 border-b-2 border-on-background p-3 sm:border-b-0 sm:border-r-2">
          <span className="font-headline text-2xl font-black text-primary">02</span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest">SAVE_TO_CRATE</p>
            <p className="mt-1 text-[9px] font-bold uppercase leading-relaxed text-on-background/45">
              Publish the song metadata and keep it in your liked songs.
            </p>
          </div>
        </div>
        <div className="flex gap-3 p-3">
          <span className="font-headline text-2xl font-black text-primary">03</span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest">FORGE_+_SHARE</p>
            <p className="mt-1 text-[9px] font-bold uppercase leading-relaxed text-on-background/45">
              Apps download locally, upload to Blossom, then compose a kind-1 note.
            </p>
          </div>
        </div>
      </div>

      <MusicBrainzSearch initialQuery={q} initialArtist={artist} />
    </div>
  );
}
