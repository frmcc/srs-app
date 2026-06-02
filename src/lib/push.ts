import { prisma } from "@/lib/db";
import webpush from "web-push";


if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || "mailto:srs@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function sendPushNotification(payload: {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}) {
  const subscriptions = await prisma.pushSubscription.findMany();

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const error = err as Error & { statusCode?: number };
        // Remove expired/invalid subscriptions
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
        throw error;
      }
    })
  );

  return results;
}
