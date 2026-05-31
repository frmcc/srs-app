import { prisma } from "../src/lib/db";

async function main() {
  try {
    console.log("Querying AppConfig...");
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 },
    });
    console.log("Config retrieved successfully:", config);
  } catch (e) {
    console.error("Prisma Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
