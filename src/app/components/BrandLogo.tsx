/**
 * The app's brand mark — the liquid-glass "Q" logo. Replaces the old amber
 * `.brand-tile` gradient square. The PNG already has its own rounded-square
 * shape; callers pass size + a matching `rounded-*` so the light corners of the
 * source are clipped. `src` is overridable (the SaaS app lets users pick a logo);
 * here it always defaults to the glass logo.
 */
export default function BrandLogo({
  className = "",
  src = "/logo-glass.png",
  alt = "SRS Master",
}: {
  className?: string;
  src?: string;
  alt?: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} draggable={false} className={`object-cover shrink-0 ${className}`} />;
}
