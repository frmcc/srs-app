import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";


export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { endpoint, keys } = body ?? {};

    if (typeof endpoint !== "string" || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    // Only accept a real https push-service endpoint URL.
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }
    if (parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Endpoint must be https" }, { status: 400 });
    }

    // Upsert - update if endpoint exists, create if not
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Push subscribe error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const endpoint = body?.endpoint;
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Push unsubscribe error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
