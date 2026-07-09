import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration. In v7 the datasource connection URL is no longer
 * allowed in schema.prisma — the CLI (migrate / introspect) reads it here, while
 * the runtime PrismaClient connects through the driver adapter set up in
 * src/lib/db.ts (better-sqlite3 locally, libSQL/Turso in production).
 *
 * The URL falls back to the local dev DB when DATABASE_URL is unset, so
 * `prisma generate` (run during `next build`, where DATABASE_URL is typically
 * NOT present) never throws on config load — using `env()` here would.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
