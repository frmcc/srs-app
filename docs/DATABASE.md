# Database & migrations

`prisma/schema.prisma` is the single source of truth. The migration history was
squashed into one baseline (`prisma/migrations/00000000000000_baseline`) that
reproduces the schema exactly. The old, broken, drifted migrations are archived
under `docs/legacy-migrations/` for reference only.

## Fresh database (local dev, CI, disaster recovery)

Local SQLite:

```bash
DATABASE_URL="file:./dev.db" npx prisma migrate deploy
```

Turso/libSQL (Prisma's CLI cannot connect to `libsql://`, so use the runner):

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node migrate-turso.mjs
```

## Existing production database (already built by the old ad-hoc scripts)

That DB is missing columns that had drifted out of every create path — most
importantly the five `comprehension*` columns and `AppConfig.wrapperMode`.
Reconcile it, then mark the baseline as applied so Prisma is in sync:

```bash
# 1) add the missing columns/tables/indexes (idempotent, safe to re-run)
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/reconcile-existing-db.mjs

# 2) tell the migration runner the baseline is already present
#    (migrate-turso.mjs records it in _srs_migrations; nothing else to do)
```

For a Prisma-tracked (non-Turso) DB you would instead run:

```bash
npx prisma migrate resolve --applied 00000000000000_baseline
```

## Manual ops actions still required (cannot be done from code)

- **Rotate the leaked Turso tokens.** Read-write tokens for `tutorsrshost` and
  `tutorsrspersonal` were previously committed in `scripts/`. They have been
  removed from source, but the exposed tokens must be revoked/rotated in the
  Turso dashboard because they persist in git history.
- **Pick ONE database.** Decide between `tutorsrshost` and `tutorsrspersonal`,
  set `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` to it everywhere, and retire the
  other. The app reads `TURSO_DATABASE_URL`; several old scripts read a raw
  `DATABASE_URL` from `.env` — the mismatch is what silently lost a past
  migration.
