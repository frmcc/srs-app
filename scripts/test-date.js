const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.sRSItem.findMany();
  console.log(items.map(i => ({ subject: i.subjectMain, nextReview: i.nextReviewDate })));
}
main();
