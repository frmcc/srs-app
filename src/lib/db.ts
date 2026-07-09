import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Use a singleton pattern for the Prisma client
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
  // Production / Turso: use the libSQL driver adapter.
  if (process.env.TURSO_DATABASE_URL) {
    const adapter = new PrismaLibSql({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }

  // Local development: file-backed SQLite via the better-sqlite3 adapter. The
  // schema enables the `driverAdapters` preview feature, so an adapter must be
  // supplied on every path — a bare `new PrismaClient()` can't connect.
  // Default to ./dev.db when DATABASE_URL is unset (e.g. during `next build`
  // page-data collection, which imports this module but never queries), so
  // construction never throws at build time. Production uses the Turso branch
  // above; if TURSO_DATABASE_URL is missing there, the middleware fail-closed
  // guard and docs/DATABASE.md cover the misconfiguration.
  const fileUrl = process.env.DATABASE_URL?.startsWith("file:")
    ? process.env.DATABASE_URL
    : "file:./dev.db";
  const adapter = new PrismaBetterSqlite3({ url: fileUrl });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
