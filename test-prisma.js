const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
console.log("prisma.reviewLog exists:", typeof prisma.reviewLog !== 'undefined');
console.log("Keys on prisma:", Object.keys(prisma).filter(k => !k.startsWith('_')));
