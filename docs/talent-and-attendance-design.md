# Learner outcomes, talent, attendance and activity (#69): design and contract

This is the contract the feature agents follow. Types are in `packages/types/src/{outcomes,talent,attendance,activity}.ts` (copied into the API by `npm run sync:types --workspace @id/api`). Anything in a response shape here that differs from those files is a bug in this document; the types win.

## 1. Scope rule

Notes, support items and the talent profile belong to **(providerId, userId)**. `providerId` is `Course.providerId` of the cohort the person is in. They follow the participant across all of that provider's cohorts (whichever workspace hosts the cohort) and never cross providers. A person in two providers' cohorts has two separate records.

"Participant of a provider" means an enrollment of any status in a cohort whose course has that provider (`ProviderAccessService.assertParticipantOfProvider`). Withdrawn people keep their record.

## 2. Data model (migration `20261010090000_talent_attendance_activity`, additive)

| Table             | Purpose                                | Key points                                                                                                                                                                                                                                                                                                             |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ParticipantNote` | staff note                             | providerId, userId, cohortId? (context, SET NULL), authorId/authorName (no FK), body, timestamps. Cascade with provider and user.                                                                                                                                                                                      |
| `SupportItem`     | staff follow-up                        | providerId, userId, cohortId?, title, category, details?, status (`open/in_progress/resolved/cancelled`), dueDate?, assigneeId/Name?, createdById/Name, resolvedAt?.                                                                                                                                                   |
| `TalentProfile`   | the learner's own profile              | unique (providerId, userId). resumeKey/Name/Size/UploadedAt, educationLevel, fieldOfStudy, school, graduationYear, yearsExperience, industries[], previousCompensation?, targetCompensation? (annual whole dollars), targetRoles[], availableFrom, shareWithEmployers (default false) + consentUpdatedAt, completedAt. |
| `DataAccessLog`   | audit                                  | actorId, actorName, providerId, subjectUserId?, resource, action, detail?, createdAt. **No foreign keys on purpose**: the trail outlives people and providers.                                                                                                                                                         |
| `CohortSession`   | a live meeting                         | cohortId (cascade), title, startsAt, endsAt?, location?, createdBy.                                                                                                                                                                                                                                                    |
| `AttendanceMark`  | one learner at one session             | unique (sessionId, userId); status `present/absent/late/excused`; note?; markedBy; markedAt.                                                                                                                                                                                                                           |
| `Cohort.delivery` | `online` (default) / `live` / `hybrid` |                                                                                                                                                                                                                                                                                                                        |
| `ActivitySession` | time spent                             | userId, enrollmentId (cascade), itemId? (SET NULL), kind `page/tool`, `day` (UTC DATE of startedAt), startedAt, lastSeenAt, seconds, estimated. Index (enrollmentId, day, itemId).                                                                                                                                     |

Daily per-learner total: `SUM(seconds) GROUP BY enrollmentId, day`. Per item: add `itemId`. First/last seen on a day: `MIN(startedAt)`, `MAX(lastSeenAt)`. A heartbeat past UTC midnight opens a new row, so a row never straddles two days.

Course item type `profile` (config `{}`) is a supported item type (talent profile form).

## 3. Access matrix

Roles are the Clerk `publicMetadata.role` (`LEARN_ROLES`). "Staff of provider P" = role `provider-admin` AND a workspace-level `Membership` (cohortId null) on institution P of kind `provider` (`assertProviderStaff`). System admin passes everything.

| Data                              | Learner (self)                     | Staff of provider P                | System admin | Organization staff | Agency admin            | Staff of other provider | Case manager |
| --------------------------------- | ---------------------------------- | ---------------------------------- | ------------ | ------------------ | ----------------------- | ----------------------- | ------------ |
| Notes, support items              | never                              | read/create/update/delete          | yes          | no                 | no                      | no                      | no           |
| Compensation, resume              | own: read/edit                     | read, export (no edit)             | yes          | no                 | no                      | no                      | no           |
| Talent profile (non-compensation) | own: read/edit                     | read, export (no edit)             | yes          | no                 | no                      | no                      | no           |
| Data access log                   | no                                 | own provider's                     | any          | no                 | no                      | no                      | no           |
| Attendance (cohort)               | own marks read-only, no staff note | roster guard (`assertCohortStaff`) | yes          | roster guard       | roster guard (in scope) | roster guard            | no           |
| Activity (cohort)                 | own totals                         | roster guard                       | yes          | roster guard       | roster guard (in scope) | roster guard            | no           |
| Outcomes (A)                      | own only                           | n/a                                | n/a          | n/a                | n/a                     | n/a                     | n/a          |

Roster guard = `assertCohortStaff(userId, role, cohortId)`: role in `agency-admin | provider-admin` (or system admin) and the caller may open the cohort's host workspace (`LearnService.assertWorkspace`). It is the same rule as `LearnCohortsService.cohortFor`. So a provider's own staff reach attendance and activity of a cohort hosted by an organization only if they are also members of that organization; talent data they reach through the provider scope.

Rules that follow from the matrix:

- No learner endpoint may ever select from `ParticipantNote`, `SupportItem` or `DataAccessLog`, and the learner profile endpoints must not return anything staff wrote. Each feature has a test that a learner (no role) gets 403 on every staff endpoint and that learner responses carry none of those fields.
- Compensation fields (`previousCompensation`, `targetCompensation`) must never appear in: list rows, any agency or workspace rollup, any `outcomes`/`gradebook`/exit-file payload, log `detail`, error messages, or server logs. They appear only in the learner's own profile, in the response of the staff `GET .../compensation` endpoint (fetched only when staff click Show compensation), and in the CSV export (opt-in). The staff `/profile` response never carries them; it has `hasCompensation` instead.
- Resumes are in `PRIVATE_MEDIA_STORAGE` only; the DB holds the key. Key format `talent/resumes/{providerId}/{userId}/{uuid}-{safeName}`. Downloads are short-lived signed URLs (300 s). Never a public URL.
- Every staff-endpoint handler begins with its access check, then validates that the target participant belongs to the provider (`assertParticipantOfProvider`), then reads.

## 4. Audit rules

`DataAccessLogService.record({actorId, providerId, subjectUserId?, resource, action, detail?, actorName?})`, **awaited before the response is built**. If the log write fails the request fails (nothing is read untraced).

| Staff request                                            | Rows written                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| list notes of a participant                              | `note` / `list`, subject                                                                                                             |
| create / update / delete a note                          | `note` / `create`, `update`, `delete`, subject                                                                                       |
| list a participant's support items                       | `support_item` / `list`, subject                                                                                                     |
| create / update / delete a support item                  | `support_item` / `create`, `update`, `delete`, subject                                                                               |
| provider-wide support queue                              | `support_item` / `list`, no subject, detail `queue, N rows`                                                                          |
| view a participant's profile                             | `talent_profile` / `read`, subject. Never a compensation row; the response carries no pay                                            |
| reveal a participant's compensation                      | `compensation` / `read`, subject, awaited before the amounts are read (a failed write fails the request and returns nothing)         |
| download a resume                                        | `resume` / `download`, subject                                                                                                       |
| export profiles (CSV)                                    | `talent_profile` / `export`, no subject, detail `csv, N rows`; plus `compensation` / `export` when compensation columns are included |
| search that filters or returns only non-sensitive fields | none                                                                                                                                 |

`detail` is at most 200 characters and holds counts or formats only, never note text, amounts or file content. Resource and action values are the unions in `talent.ts`. Reading the log: `GET /learn/data-access-log?providerId&subjectUserId&actorId&resource&limit&before` (system admin: any or all providers; provider staff: `providerId` required and must be their own) returns `DataAccessLogPage`. Reading the log itself is not logged.

## 5. Shared pieces already built (do not redo)

API, `apps/api/src/learn/`:

- `ProviderAccessService` (`provider-access.service.ts`): `providerOfCohort`, `assertProviderStaff`, `assertCohortStaff`, `assertParticipantOfProvider`, `assertLearnerOfProvider`, `assertLearnerOfCohort` (returns the enrollment id). Constants `PROVIDER_STAFF_ROLES`, `COHORT_STAFF_ROLES`.
- `DataAccessLogService` (`record`, `list`) and `DataAccessLogController`.
- `LearnAccessModule` provides `LearnService`, `ProviderAccessService`, `DataAccessLogService`. Each feature module imports it; each feature service already injects `prisma`, `access`, `audit`.
- Skeleton modules `outcomes/`, `talent/`, `attendance/`, `activity/` (module, controller `@Controller('learn')` with `LearnGuard`, service), registered in `LearnModule`. Add routes and methods only inside your folder.
- `Cohort.delivery` is validated and carried on cohort create/update/list/detail.

Web, `apps/learn/src/dashboard/`: routes, nav entries, links and stubs are wired. Replace the stub bodies only.

| Mount                                                                  | Stub                           | Props                                                           |
| ---------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| `/lms/learning/outcomes`                                               | `outcomes/LearnerOutcomesPage` | none                                                            |
| `/lms/learning/profile`                                                | `talent/MyProfilePage`         | none                                                            |
| item type `profile` in `LearningItemPage`                              | `talent/TalentProfileItem`     | `{item, onChange, nextHref, nextLabel}` like other item players |
| `/lms/talent` (provider workspaces only)                               | `talent/TalentPage`            | `{providerId, workspace}`                                       |
| `/lms/talent/:userId` (provider only)                                  | `talent/TalentParticipantPage` | `{providerId, userId}`                                          |
| `/lms/activity`, `/lms/activity/:cohortId` (provider and organization) | `activity/ActivityPage`        | `{workspace, cohortId?}`                                        |
| every `/lms/learning/*` page                                           | `activity/ActivityHeartbeat`   | `{pathname}`; parses `/lms/learning/:cohortId[/:itemId]`        |
| cohort page, only when `delivery !== 'online'`                         | `attendance/AttendancePanel`   | `{cohortId}`                                                    |

Each feature has its own CSS file next to its stub (`outcomes.css`, `talent.css`, `attendance.css`, `activity.css`) with a class prefix (`lo-`, `tl-`, `at-`, `ac-`). Do not append to `dashboard.css`. Do not use `?` in `href()` paths (it appends the context query naively): use path segments.

## 6. Endpoints

All under the API prefix, all behind `LearnGuard`. Errors use Nest exceptions with plain-language messages (403 no access, 404 not found, 400/409 validation, as the existing services do).

### A. Learner outcomes (agent A, `outcomes/`)

`GET /learn/me/outcomes` -> `LearnerOutcomes`. Any signed-in learner; only the caller's own enrollments (withdrawn excluded). Reuse `readiness`/`skills` logic from `learner.service.ts`/`outcomes.ts`/`skills.ts`. No compensation, no staff data.

Response notes (fix pass): `items` holds each ordinary item plus a "Review: ..." row for content a learner must redo (`review: true`); the pre-check carries `preCheck: true`. The average score on the page is the mean of the best score on each scored item, counted once (reviews and the pre-check left out). `totals.attempts` is the attempts on scored items. `hasInterview` says whether the course has anything that counts as an interview: only then does completion need interview readiness, so the page never asks for a practice interview otherwise.

Nav and routes (web): Talent, Support and `/lms/talent/*` need provider-admin or system-admin in a provider workspace; Activity and `/lms/activity` need agency-admin, provider-admin or system-admin in a provider or organization workspace. The role comes from the Clerk public metadata (`useRole`), as for Admin. Anyone else, and agency workspaces, get a "Page not found" notice for those routes. The API stays the real gate.

### B. Staff notes and support items (agent B, in `talent/`; path prefix `/learn/providers/:providerId/participants/:userId`)

Guard for all: `assertProviderStaff(userId, role, providerId)` then `assertParticipantOfProvider(providerId, :userId)`.

| Method and path                                                              | Body                                                                                                                                                          | Response                                                | Audit                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------- |
| `GET .../notes`                                                              |                                                                                                                                                               | `ParticipantNoteDto[]` newest first                     | note/list                     |
| `POST .../notes`                                                             | `NoteInput` (`body` 1-4000, `cohortId?` must be a cohort of this provider)                                                                                    | `ParticipantNoteDto`                                    | note/create                   |
| `PUT .../notes/:noteId`                                                      | `{body}`                                                                                                                                                      | `ParticipantNoteDto`                                    | note/update                   |
| `DELETE .../notes/:noteId`                                                   |                                                                                                                                                               | `{deleted: true}`                                       | note/delete                   |
| `GET .../support-items`                                                      |                                                                                                                                                               | `SupportItemDto[]`                                      | support_item/list             |
| `POST .../support-items`                                                     | `SupportItemInput` (`title` 1-200 required; `category` default `other`; `details` <= 2000; `dueDate` YYYY-MM-DD; `assigneeId` must be staff of this provider) | `SupportItemDto`                                        | support_item/create           |
| `PUT .../support-items/:itemId`                                              | partial `SupportItemInput`; `status` -> `resolved` sets `resolvedAt`, leaving it clears                                                                       | `SupportItemDto`                                        | support_item/update           |
| `DELETE .../support-items/:itemId`                                           |                                                                                                                                                               | `{deleted: true}`                                       | support_item/delete           |
| `GET /learn/providers/:providerId/support-items?status&assigneeId&dueBefore` |                                                                                                                                                               | `SupportQueueRow[]` (guard: `assertProviderStaff` only) | support_item/list, no subject |

A note or item whose `providerId`/`userId` does not match the path is 404 (never reveal it exists).

### C. Talent profile (agent C, `talent/`)

Learner (own data; `LearnGuard` only):

| Method and path                                       | Body                                                                                      | Response                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /learn/me/talent-profiles`                       |                                                                                           | `LearnerTalentProfileEntry[]`: one per provider the learner is enrolled with                                                                                                                                                                                                                                                                      |
| `PUT /learn/me/talent-profiles/:providerId`           | `TalentProfileInput`                                                                      | `TalentProfileDto` (upsert; guard `assertLearnerOfProvider`). `complete: true` needs educationLevel, yearsExperience, at least one of industries/targetRoles; sets `completedAt`. `shareWithEmployers` change sets `consentUpdatedAt`. Whole dollars `0..10_000_000`; years `0..60`; year `1950..2100`; text <= 200; lists <= 20 entries of <= 80 |
| `POST /learn/me/talent-profiles/:providerId/resume`   | multipart `file` (pdf, doc, docx; <= 5 MB; check extension, content type and magic bytes) | `TalentProfileDto`. Replaces any previous resume (delete the old object)                                                                                                                                                                                                                                                                          |
| `GET /learn/me/talent-profiles/:providerId/resume`    |                                                                                           | `ResumeLink`                                                                                                                                                                                                                                                                                                                                      |
| `DELETE /learn/me/talent-profiles/:providerId/resume` |                                                                                           | `TalentProfileDto`                                                                                                                                                                                                                                                                                                                                |

Completing a `profile` course item: after a successful `complete: true` save, the profile item for that provider's cohort counts as completed. The talent agent adds the one hook this needs in `learner.service.ts` (it owns that edit; keep it to the item-type switch).

Staff (path prefix `/learn/providers/:providerId`; guard `assertProviderStaff`):

| Method and path                                                                                               | Response                                                                                              | Audit                                         |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `GET /participants?q&cohortId&industry&role&educationLevel&share=true&completed=true&hasResume=true&minYears` | `TalentParticipantRow[]` (no compensation; `q` matches name or email)                                 | none                                          |
| `GET /participants/:userId`                                                                                   | `TalentParticipantHeader` (404 unless participant of provider)                                        | none                                          |
| `GET /participants/:userId/profile`                                                                           | `TalentProfileStaffView \| null`, no compensation, `hasCompensation: boolean`                         | talent_profile/read                           |
| `GET /participants/:userId/compensation`                                                                      | `TalentCompensation` (`Cache-Control: no-store`; 404 if no profile; same guards as the others)        | compensation/read, written first              |
| `GET /participants/:userId/resume`                                                                            | `ResumeLink`                                                                                          | resume/download                               |
| `GET /talent-export.csv?` same filters + `includeCompensation=true`                                           | `text/csv` with `Content-Disposition: attachment` (CSV-escape cells and neutralize leading `= + - @`) | talent_profile/export (+ compensation/export) |

Staff cannot edit a profile. When `shareWithEmployers` is false the participant is still visible to the provider's staff (they run the program) but the export marks the column `share`; any future employer-facing view must filter on it.

### D. Attendance (agent D, `attendance/`)

Staff guard: `assertCohortStaff(userId, role, cohortId)`. Writes also require `delivery` of `live` or `hybrid` (409 "This cohort is online-only" otherwise); reads work for any delivery.

| Method and path                                          | Body                                                                                         | Response                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /learn/cohorts/:cohortId/sessions`                  |                                                                                              | `CohortSessionDto[]` ascending by `startsAt`, with counts                                                                                      |
| `POST /learn/cohorts/:cohortId/sessions`                 | `SessionInput` (`title` 1-120, `startsAt` ISO, `endsAt` after `startsAt`, `location` <= 200) | `CohortSessionDto`                                                                                                                             |
| `PUT /learn/cohorts/:cohortId/sessions/:sessionId`       | partial `SessionInput`                                                                       | `CohortSessionDto`                                                                                                                             |
| `DELETE /learn/cohorts/:cohortId/sessions/:sessionId`    |                                                                                              | `{deleted: true}` (marks go with it)                                                                                                           |
| `GET /learn/cohorts/:cohortId/sessions/:sessionId/marks` |                                                                                              | `AttendanceSheet` (non-withdrawn roster plus anyone already marked, by name)                                                                   |
| `PUT /learn/cohorts/:cohortId/sessions/:sessionId/marks` | `MarkInput` (every `userId` must be enrolled in this cohort; `note` <= 500)                  | `AttendanceSheet`. Upserts in one transaction; sets `markedBy`/`markedAt`                                                                      |
| `GET /learn/cohorts/:cohortId/attendance`                |                                                                                              | `AttendanceSummary`                                                                                                                            |
| `GET /learn/cohorts/:cohortId/attendance.csv`            |                                                                                              | `text/csv` (UTF-8 BOM): name, email, present, absent, late, excused, sessions_counted, sessions_held, rate_percent (a number, empty when none) |

Learner: `GET /learn/me/cohorts/:cohortId/attendance` -> `LearnerAttendance` (guard `assertLearnerOfCohort`; own marks only; staff `note` never included). Attendance is not audit-logged (not in the sensitive set); it is covered by the roster guard.

Rate: `(present + late) / (counted sessions - excused)`; `null` when the denominator is 0. A session counts for a learner only if (1) its `startsAt` has passed, (2) at least one mark exists for it (the register was taken; until then the summary and the learner's line say "not taken yet"), and (3) the learner's `Enrollment.enrolledAt` is before `startsAt` (otherwise "before you joined"). Within a counted session a learner with no mark is absent; excused is left out of the denominator. `sessions_held` is every session that has started, counted or not. `PUT .../marks` returns the fresh sheet; concurrent saves are last-write-wins per learner and the UI shows "Saved at HH:MM".

### E. Activity logs (agent E, `activity/`)

Learner write (guard `assertLearnerOfCohort`, cohort not withdrawn):

`POST /learn/me/activity/heartbeat` body `HeartbeatInput` -> 204. Time is active time (idle time is not counted). Server rules (the client cannot inflate time): find the learner's latest page `ActivitySession` (any item) on today's UTC `day`; every beat is measured against that latest beat, so two tabs cannot earn more than elapsed time. If `now - lastSeenAt <= 90 s` and the item is the same, add `min(gap, 60)` seconds and set `lastSeenAt = now`; if the item differs, open a row for the NEW item with `seconds = min(gap, 60)` (a conditional update on the latest row claims the beat first, so two tabs switching together credit it once); a gap over 90 s opens a new row with `seconds = 0`. Ignore (204, no write) beats under 10 s apart, an `itemId` not in the cohort's course, and a cohort whose `endsAt` has passed by more than a day. Client: every 30 s while `document.visibilityState === 'visible'` and there was input within the last 60 s; none while hidden or idle.

Connected tools (no `ItemProgress` write at launch, no schema change): at launch, `LtiPlatformService.startLaunch` (after the learner, cohort and tool are authorised, and never for an unavailable tool) calls `ActivityService.openToolLaunch(enrollmentId, userId, itemId)` as a best-effort side effect (not awaited, errors swallowed, so it cannot slow or fail a launch). It writes one `ActivitySession` row, `kind: 'tool'`, `estimated: true`, `seconds 0`, `startedAt = lastSeenAt = now`; a row with `lastSeenAt = startedAt` is open. A repeat launch within 4 h of an open row reuses it. At score return, `recordToolResult` calls `closeToolLaunch(enrollmentId, itemId)`: the latest open row started within 4 h gets `seconds = min(now - startedAt, 4 h)` (never negative) and `lastSeenAt` moved past `startedAt` (closed), split at UTC midnight (later parts as extra rows). A score with no open launch row writes nothing, and a repeated report finds the row closed, so time is never double counted.

Staff (guard `assertCohortStaff`; `from`/`to` are YYYY-MM-DD, default last 30 days, max range 366 days; not audit-logged):

| Method and path                                                  | Response                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /learn/cohorts/:cohortId/activity?from&to`                  | `CohortActivityReport`                                                                                                                                                                                                                              |
| `GET /learn/cohorts/:cohortId/activity/learners/:userId?from&to` | `LearnerActivityReport` (404 unless enrolled in the cohort)                                                                                                                                                                                         |
| `GET /learn/cohorts/:cohortId/activity.csv?from&to`              | `text/csv` (UTF-8 BOM), one row per learner per day per item: learner, email, date, item, kind, measured_minutes, estimated_minutes (1 decimal, the unused one blank). More than 100,000 rows is refused with 413 and a message to narrow the range |

Learner: `GET /learn/me/cohorts/:cohortId/activity?from&to` -> `LearnerActivityReport` for the caller only.

Reports aggregate in SQL (`GROUP BY`), never by loading every row. Measured and estimated time are kept apart in every shape: each of the cohort total, per-day, per-item, per-learner and learner-day figures carries `measuredSeconds` and `estimatedSeconds` (`totalSeconds`/`seconds` is their sum). Estimated tool time is a guess from launch to score and can overlap page time, which the UI says. Learners see a notice on their course page that active time is recorded, never what they type.

## 7. Cohort delivery

`delivery` is `online | live | hybrid` on `CohortListItem`/`CohortDetail`, accepted on `POST /learn/workspaces/:ws/cohorts` and `PUT /learn/cohorts/:id` (default `online`, 400 on anything else). The cohort details form has a select. The Attendance panel mounts for `live`/`hybrid`; the Activity link is always on the cohort page.

## 8. Limits and known gaps (decided or open)

- Case managers get none of this (they are read-only outcome readers). To change, edit `PROVIDER_STAFF_ROLES` and `COHORT_STAFF_ROLES` in `provider-access.service.ts`.
- Activity days are UTC; a cohort in a US timezone will see evening time land on the next day.
- Provider staff who are not members of a cohort's host organization cannot open that cohort's attendance or activity (roster rule); they reach talent data through the provider scope.
- `DataAccessLog` has no retention policy and no foreign keys. Deleting a user removes their notes and profile but leaves the audit rows (ids only).
- No email notifications (no email service yet).
