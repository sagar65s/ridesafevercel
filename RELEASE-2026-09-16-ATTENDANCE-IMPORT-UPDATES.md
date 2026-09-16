# RideSafe attendance import and live update release

This complete project release fixes attendance import visibility and correction handling for Super Admin and School Admin.

## Correct behavior

- Super Admin must select a school before importing. School Admin imports are always restricted to the signed-in school.
- Excel and CSV rows with a verified trip, student, route and bus are shown inside that trip as `SCHOOL_IMPORT` records.
- Rows without a verified trip are retained in the uploaded historical attendance section and included in the selected date's attendance totals.
- Re-importing the same school record updates its status, time and source details instead of silently ignoring the correction. Legacy status-specific import keys from earlier releases are matched and updated without requiring a second schema change.
- Driver/maintainer events remain authoritative. Spreadsheet rows never satisfy trip-completion attendance, parent confirmation or boarding/drop-off notification rules.
- Attendance refreshes every 10 seconds and whenever the browser window regains focus. Trip History refreshes every 12 seconds and on focus after a driver completes a trip.
- The import response returns the first affected date and the UI switches to that date so newly imported records are immediately visible. Multi-date imports remain available through the date filter.

## Required production database migration

Historical rows require `prisma/migrations/20260915140000_attendance_import_archive/migration.sql`. This cannot be replaced by a front-end change. Back up production first, rotate any database password posted in chat/logs, and use the direct/unpooled connection URL for the same Neon branch and database used by Vercel:

```powershell
Set-Location 'D:\ridesafevercel'
$env:DIRECT_URL = 'PASTE_NEW_DIRECT_NEON_URL_HERE'
node scripts/migrate-production.mjs --check-url
npm run db:migrate
npm run db:status
Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
```

The migration is complete only when `npm run db:migrate` succeeds and `npm run db:status` reports no pending migrations. Do not use the `-pooler` URL, `prisma migrate reset`, `prisma migrate dev`, `prisma db push`, or a destructive seed against production.
