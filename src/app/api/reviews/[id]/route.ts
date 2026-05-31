import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const { id } = params;

    const item = await prisma.sRSItem.findUnique({
      where: { id },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Attempt to delete associated local podcast files if they exist
    const publicDir = path.join(process.cwd(), "public");
    if (item.prePodcastUrl) {
      try {
        await fs.unlink(path.join(publicDir, item.prePodcastUrl));
      } catch (e) {
        console.warn("Could not delete pre-podcast file:", e);
      }
    }
    if (item.postPodcastUrl) {
      try {
        await fs.unlink(path.join(publicDir, item.postPodcastUrl));
      } catch (e) {
        console.warn("Could not delete post-podcast file:", e);
      }
    }

    // Delete from DB
    await prisma.sRSItem.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting item:", error);
    return NextResponse.json(
      { error: "Failed to delete item", details: error.message },
      { status: 500 }
    );
  }
}
