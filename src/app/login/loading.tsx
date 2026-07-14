/**
 * Overrides the root loading.tsx (dashboard-shaped) for the login segment:
 * the login page is a sidebar-less centered hero, so the calmest fallback is
 * just the paper background — the page itself animates in immediately after.
 */
export default function Loading() {
  return <div className="min-h-[100dvh]" aria-busy="true" />;
}
