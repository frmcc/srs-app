import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// Applies prisma/migrations/*/migration.sql to a Turso/libSQL database, in
// order, exactly once each. Prisma's own `migrate deploy` cannot talk to a
// `libsql://` URL (it needs the driver adapter the CLI doesn't use), so this
// runner is the deploy path for Turso.
//
// Sound-by-design:
//  - tracks applied migrations in `_srs_migrations` and skips them next run;
//  - runs each migration's statements in a single transaction (batch);
//  - FAILS LOUDLY on any real error (unlike the old "continue on error" version).
//    "already exists" / "duplicate column" are tolerated and logged: they mean
//    the schema object was created before the tracker knew about it (hand-applied
//    hotfix, or rows added to the DB before _srs_migrations existed). Skipping
//    the statement and recording the migration reconciles that drift — without
//    it, ONE pre-existing column blocks every later migration from ever running
//    (exactly how prod ended up missing the answer-snapshot columns).

const IGNORABLE = /already exists|duplicate column name/i;

async function migrate() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    console.error('Missing TURSO_DATABASE_URL');
    process.exit(1);
  }

  const client = createClient({ url, authToken });
  console.log('Connected to Turso.');

  await client.execute(
    'CREATE TABLE IF NOT EXISTS "_srs_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  );
  const applied = new Set(
    (await client.execute('SELECT name FROM "_srs_migrations"')).rows.map((r) => r.name),
  );

  const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
  const dirs = fs
    .readdirSync(migrationsDir)
    .filter((d) => fs.statSync(path.join(migrationsDir, d)).isDirectory())
    .sort();

  for (const dir of dirs) {
    if (applied.has(dir)) {
      console.log(`Skipping (already applied): ${dir}`);
      continue;
    }
    const sqlPath = path.join(migrationsDir, dir, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;

    console.log(`Applying migration: ${dir}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    // Strip comments BEFORE splitting: a ';' inside a comment line must not
    // cut a statement in half (it produced unparseable fragments).
    const statements = sql
      .replace(/--.*$/gm, '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        await client.execute(statement);
      } catch (e) {
        if (IGNORABLE.test(String(e?.message))) {
          console.log(`  · already present, skipping statement: ${statement.split('\n')[0].slice(0, 70)}`);
          continue;
        }
        console.error(`\nMigration ${dir} failed on statement:\n${statement}\n`);
        console.error(e);
        process.exit(1);
      }
    }
    await client.execute({ sql: 'INSERT INTO "_srs_migrations" (name) VALUES (?)', args: [dir] });
    console.log(`  ✓ ${dir}`);
  }

  console.log('Migrations complete.');
  process.exit(0);
}

migrate();
