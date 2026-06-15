import { fetchReviewList } from "@/lib/review-query";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const items = await fetchReviewList();
  // Read the (public) VAPID key at runtime on the server and pass it down, so it
  // doesn't depend on being inlined into the client bundle at build time.
  return <DashboardClient initialItems={items} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />;
}
