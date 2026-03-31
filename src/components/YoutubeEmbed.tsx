interface Props {
  videoId: string;
  onClose: () => void;
}

export function YoutubeEmbed({ videoId, onClose }: Props) {
  return (
    <div className="border-t-2 border-on-background/10 bg-black">
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <button
        onClick={onClose}
        className="w-full py-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center gap-1"
      >
        <span className="material-symbols-outlined text-[12px]">close</span>
        CLOSE
      </button>
    </div>
  );
}
