# RideSafe — historical attendance, portal colors, and language coverage

This package includes all earlier RideSafe source, templates, Docker assets,
and the complete academic calendar, student and chat changes. No production
data was modified while preparing this release.

## Attendance import

The bundled `attendance-period.xlsx` is a historical demonstration sheet. Its
routes, bus labels and dates are not automatically trips in a real school's
database. Matching recorded trip + assigned student rows import into the
regular bus attendance table. Rows without a verified trip/student assignment
now upload into a separate school-scoped historical attendance section,
including `Not marked`. They are visible for the uploaded date and export with
`Source=UPLOADED_HISTORY`. Such rows **do not** create fake journeys, trigger
boarding notifications, or become driver-confirmed attendance. Re-imports of
the same historical row are idempotent. Actual attendance requires assigning
the student to a school bus and route, then starting the relevant trip.

The added database migration
`20260915140000_attendance_import_archive` creates only the archive table.
Run `npx prisma@5.22.0 migrate deploy` against your already configured Neon
database **before** publishing the new Vercel code. Docker automatically runs
the committed migrations on app start. Back up production data first. Never
run the destructive demonstration seed on production.

## Messages, maintenance, language

Shared chat and maintenance panels inside the crew portal inherit RideSafe's
charcoal/yellow colors instead of an earlier white theme. Parent and driver
dashboard/navigation/status/payment labels, dynamic confirmations, maintenance
types and common admin attendance labels have both Malay and Chinese strings.
Names, student IDs, route names, user-entered messages, license plates, sample
email addresses, and Malaysian `RM` are intentional non-translatable data.

## Verification and running

1. Extract the **entire** ZIP folder; retain your own environment values,
   never copy real `.env` files into GitHub.
2. Run `npm ci` and `npm run check` from its root; install/build use Node 20+
   and the included verified source manifest.
3. Deploy migrations to Neon before deploying on Vercel; use `npm run build`
   as the Vercel Build Command, Next.js preset, and blank Output Directory.
4. For Docker run `docker compose --env-file .env.production up --build -d`
   after reviewing the production environment.
5. Test a real attendance upload with an assigned school trip and compare the
   live records with the separate historical-upload view. Server builds and
   mocked tests cannot establish end-to-end behavior of your private Neon DB.
