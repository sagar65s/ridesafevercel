# RideSafe complete project: Neon migration diagnostics

This is the complete RideSafe website, not a patch-only archive. The historical attendance table migration is included at `prisma/migrations/20260915140000_attendance_import_archive/migration.sql`. The `P1001` screenshot means **the migration has not yet been applied**. `Test-NetConnection` only confirms that a TCP port accepted a connection; it does not confirm that PostgreSQL authentication or a Prisma session completed. `prisma migrate status` reports pending migrations but does not apply them.

The updated `npm run db:migrate` and `npm run db:status` commands accept `DIRECT_URL` (preferred) or an explicitly direct `DATABASE_URL`. Both reject a Neon hostname with `-pooler` **before invoking Prisma**, without printing credentials. A pooled URL can still be used by the web app at runtime; only migrations require a direct URL. Never guess a direct host by editing the pooled hostname: select Direct/Unpooled in the Neon connection panel for the exact same database and branch as Vercel.

Before touching production, take a database backup. A password previously posted in a chat/log must be rotated in Neon; update Vercel's runtime `DATABASE_URL` to the new credential and redeploy. Do not commit credentials or share them in support output.

Run these commands in **PowerShell**, from the extracted project root containing both `package.json` and `prisma/schema.prisma`:

```powershell
Set-Location 'D:\ridesafevercel'
Test-Path .\package.json
Test-Path .\prisma\schema.prisma
npm ci
$env:DIRECT_URL = 'PASTE_THE_NEW_DIRECT_NEON_URL_FOR_THIS_SAME_DATABASE_HERE'
node scripts/migrate-production.mjs --check-url
Test-NetConnection -ComputerName ([uri]$env:DIRECT_URL).Host -Port 5432
npm run db:migrate
npm run db:status
Remove-Item Env:DIRECT_URL
```

Only run `npm ci` and the remaining commands if both `Test-Path` checks return `True`. `--check-url` does not contact the database; `TcpTestSucceeded: True` also does not prove a Prisma connection. If the **direct** URL still yields `P1001`, stop and check the Neon console, connection/endpoint status, network restrictions, and that the database/branch match Vercel. Share only a **redacted** error; there is no safe code-only workaround for a database the Prisma CLI cannot connect to. If `npm run db:migrate` succeeds, confirm `npm run db:status` shows **no pending migrations**, then verify the live attendance screen and historical attendance import after the updated GitHub/Vercel deployment.

Do not run `prisma migrate dev`, `prisma migrate reset`, `prisma db push`, or a destructive seed on this production database.
