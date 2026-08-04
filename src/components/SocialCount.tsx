export function formatSocialCount(count: number): string {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (count >= 1_000) {
    const thousands = count / 1_000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return String(count);
}

export function SocialCount({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span
      className="ml-1 text-[9px] font-black tabular-nums leading-none md:text-[10px]"
      data-social-count
    >
      {formatSocialCount(count)}
    </span>
  );
}
