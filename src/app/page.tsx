import { fetchReviewList } from "@/lib/review-query";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const items = await fetchReviewList();
  return <DashboardClient initialItems={items} />;
}
