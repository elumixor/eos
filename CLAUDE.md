# EOS — Claude Instructions

## iOS Releases

To ship a new TestFlight build, run from repo root:

```bash
bun run release             # auto-bumps patch (default)
bun run release minor       # 1.0.3 → 1.1.0
bun run release major       # 1.0.3 → 2.0.0
bun run release 1.2.0       # explicit version
```

This reads the current `MARKETING_VERSION` from the iOS project, bumps it, commits, creates an `ios-v<version>` git tag, and pushes both. The `.github/workflows/ios-testflight.yml` workflow triggers on `ios-v*` tags and uploads the build to TestFlight via fastlane. The build number (`CFBundleVersion`) is auto-incremented inside the workflow off the latest TestFlight number — never manually bumped.

Do not add a `workflow_dispatch` trigger. Releases must go through the `release` script so the tag/version history is consistent.

## Database — `apps/backend/.env` points at PRODUCTION

`TURSO_DATABASE_URL` in `apps/backend/.env` is the prod Turso DB. There is no separate dev DB. The local backend (`bun dev`) reads/writes prod.

This means:

- `scripts/apply-migration.ts` runs against **prod**. Always confirm with the user before invoking it.
- Destructive migrations (DROP TABLE, DROP COLUMN, ALTER COLUMN that rewrites data) require explicit per-run confirmation — not a blanket "yes, apply migrations".
- When you see a 500 like `no such column: main.Task.X`, the cause is almost always an unapplied migration in `apps/backend/prisma/migrations/`. Apply pending migrations in timestamp order. Do NOT edit schema or routes to work around the missing column.
- Never run raw `prisma db push` or `prisma migrate deploy` against this DB without confirmation — they hit prod.
