/** Archive storage is optional while a production database waits for its
 * committed migration. A missing archive must not hide real driver trips. */
export const ARCHIVE_MIGRATION_ERROR = 'Historical attendance uploads need a database update. Apply the committed RideSafe migration (npx prisma@5.22.0 migrate deploy) to the app database, then try again.'

export function isArchiveTableMissing(error:unknown):boolean {
  if(!error||typeof error!=='object')return false
  const details=error as {code?:unknown;meta?:{table?:unknown;modelName?:unknown};message?:unknown}
  return details.code==='P2021'&&[
    details.meta?.table,details.meta?.modelName,details.message,
  ].some(value=>typeof value==='string'&&value.includes('AttendanceImportRecord'))
}
