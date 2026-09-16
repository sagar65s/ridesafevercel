# RideSafe persistent attendance, scoped reset and confirmation release

## Attendance persistence

- Imported attendance continues to be stored in PostgreSQL. Refreshing the page or signing in again now restores the last Attendance date used in that browser and reloads the records from the server.
- Super Admin's last selected school is restored after refresh/sign-in and shared between Attendance and Academic Calendar screens.
- A stored school selection is validated against the active organisation list before it is used.
- Re-importing the same trip/student or historical school record updates the existing imported record instead of creating an additional visible copy.
- Attendance imports query only the date range present in the uploaded file instead of loading every trip ever recorded for the school.
- Attendance background refresh is kept active at a lower-cost 15-second interval and still refreshes immediately when the browser regains focus.

## Super Admin resets

- Only `SUPER_ADMIN` can call `/api/admin/data-reset`.
- A school must be explicitly selected and its exact name must be typed in the in-app dialog.
- Attendance reset removes that school's attendance, parent confirmation rows and uploaded historical attendance. Trips, students and every other school are preserved.
- Academic Calendar reset removes only that school's events and calendar import log.
- Each successful reset is recorded in the audit log and runs in a database transaction.

## In-app delete confirmations

- Student, user, organisation, fleet, route, stop, maintenance, announcement, calendar, notification, chat-message and trip-history delete/deactivate actions now use the RideSafe in-app confirmation dialog.
- Browser delete confirmation popups are no longer used. Emergency/SOS safety confirmation remains separate from deletion.

## Verification

- TypeScript and ESLint pass.
- 29 Jest suites and 181 tests pass.
- Next.js production build passes, including `/api/admin/data-reset`.
