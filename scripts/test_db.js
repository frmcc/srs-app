const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.sRSItem.findMany({ select: { id: true, subjectMain: true, prePodcastPrompt: true, postPodcastPrompt: true } });
  items.forEach(i => console.log(i.id, i.prePodcastPrompt?.substring(0, 10)));
}
main();
