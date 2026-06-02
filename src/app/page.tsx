import { prisma } from "@/lib/db";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const items = await prisma.sRSItem.findMany({
    where: {
      subjectMain: {
        not: "Freies Lernen"
      }
    },
    orderBy: { nextReviewDate: "asc" }
  });

  return <DashboardClient initialItems={items} />;
}
