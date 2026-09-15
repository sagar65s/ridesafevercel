# RideSafe attendance and School Admin trip visibility fix

This release preserves the complete existing project, including the historical attendance migration `prisma/migrations/20260915140000_attendance_import_archive/migration.sql`.

## Production database prerequisite (Vercel + Neon)

The screenshot error `public.AttendanceImportRecord does not exist` means the database used by the deployed site has not received the historical attendance migration. Vercel's `npm run build` does **not** run database migrations. Run this once against the **same Neon database** that is configured as `DATABASE_URL` for the Vercel Production deployment. Back up production data first. Use the Neon **direct/unpooled** connection URL for the migration; do not post or commit credentials.

In PowerShell from the extracted project root, with Node.js installed:

```powershell
npm ci
$env:DATABASE_URL="<Neon direct connection URL for the same production database>"
npm run db:migrate
npx prisma migrate status
Remove-Item Env:DATABASE_URL
```

Redeploy the updated project to Vercel. If Prisma says the migration was already applied but the deployed application still reports that the table is missing, check that the Neon database and branch selected in Vercel's `DATABASE_URL` are the same ones used above. Do not use `prisma db push`, reset the database, or seed production users to fix this error.

For Docker Compose, the existing startup deploys the included migrations automatically; ensure the Compose PostgreSQL database and web application use the matching `DATABASE_URL` and let the migration finish before testing.

## Behavior

- School Admin attendance now displays live driver-recorded trip attendance even when the optional historical-import table has not yet been migrated, instead of incorrectly showing zero trips.
- Both Attendance and Trip History refresh in the background after driver actions; choose the **actual school**, **trip date**, and **route**. Selecting a date or route with no matching trip accurately shows an empty result.
- Historical Excel/CSV rows cannot be imported until the migration succeeds. The API returns an actionable migration-required error rather than exposing raw Prisma details; a mixed live/historical file does not silently half-import.
- The historical import archive is organization-scoped. No migration or production user records are modified by `npm run build`.

The included attendance template has example rows, which may not correspond to real routes, students or trips. For existing live trip attendance, use values from this school's actual records; example/historical entries are stored separately after migration.
