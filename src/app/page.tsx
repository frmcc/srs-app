import { fetchReviewList, fetchPassRate30 } from "@/lib/review-query";
import { calendarTokenFor } from "@/lib/auth-token";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { scribbleEnabledForEmail } from "@/lib/feature-flags";
import { prisma } from "@/lib/db";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Belt & suspenders with the middleware: no session → branded Google login.
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // The extra reads kill first-paint flashes: without them the client briefly
  // rendered German UI for English users and a late-popping pass-rate card
  // until /api/settings and /api/stats came back.
  const [items, config, passRate30] = await Promise.all([
    fetchReviewList(),
    prisma.appConfig.findUnique({ where: { id: 1 }, select: { language: true } }),
    fetchPassRate30(),
  ]);

  // Read-only feed token for the calendar-subscription URLs: calendar clients
  // can't log in, so the ICS feeds authenticate via ?token= (middleware accepts
  // it ONLY for GET /api/calendar*). Still derived from BASIC_AUTH_USER/PASSWORD
  // so EXISTING calendar subscriptions keep working. Null when not configured.
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  const calendarToken = user && pass ? await calendarTokenFor(user, pass) : null;

  // Read the (public) VAPID key at runtime on the server and pass it down, so it
  // doesn't depend on being inlined into the client bundle at build time.
  return (
    <DashboardClient
      initialItems={items}
      userName={session.user.name ?? null}
      userImage={session.user.image ?? null}
      userEmail={session.user.email ?? null}
      initialLanguage={config?.language ?? "german"}
      initialPassRate30={passRate30}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
      calendarToken={calendarToken}
      scribbleEnabled={scribbleEnabledForEmail(session.user.email)}
    />
  );
}
