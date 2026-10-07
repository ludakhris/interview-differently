# Creating an Admin User

Admin users have access to the scenario builder (`/builder`). Access is controlled via a `role` field in Clerk's public metadata.

## Steps

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) and select the **InterviewDifferently** application.

2. Navigate to **Users** in the left sidebar.

3. Click the user you want to promote to admin.

4. Scroll down to **Public metadata** and click the edit icon.

5. Add the following JSON:

   ```json
   { "role": "admin" }
   ```

6. Click **Save**.

The user will have builder access on their next page load — no sign-out required.

## Revoking Admin Access

To remove admin access, edit the same **Public metadata** field and either delete the `role` key or change the value to anything other than `"admin"`:

```json
{}
```

## LearnDifferently admin toolbox (`/lms/admin`)

System admins (LearnDifferently Clerk `publicMetadata.role` = `system-admin`) get an **Admin** link with system tools. Today there are two. **User permissions** (`/lms/admin/users`) finds a user by email or name and sets their role to any value in `LEARN_ROLES` (`apps/api/src/learn/learn.service.ts`), or clears it. A user holds one role. You cannot change your own role. **Connected tools** (`/lms/admin/tools`) lists the tools learners can be sent to (Interview Differently is added by `npm run seed:lti-tools`), adds new ones (and the connections they launch through), switches them off, limits each to chosen agencies and providers, and keeps a history of who changed what. See `docs/lti-integration.md`, "Registration".

The first system admin must be set by hand in the **LearnDifferently** Clerk dashboard (same steps as above, with `{ "role": "system-admin" }`). After that, roles are managed in the tool.

## LearnDifferently demo data in production

`apps/api/scripts/seed-learn-demo.ts` loads fictional sample data: two agencies (Delaware, Chesapeake), 8 providers, 8 courses, 24 cohorts, about 580 enrollments and 576 learners. Each course has two skills (tagged check questions, a hidden refresher lesson, and the skill's lesson set up as a review), and about 60 learners have missed a skill, so their plans include added items. That shows adaptive remediation in the gradebook and progress totals. Production was loaded on 2026-10-06 for the 2026-10-07 Delaware Department of Labor demo, and reloaded the same day once the skills and plan items existed.

Every demo row has an id starting with `demo-`, so loading and removing touch nothing else. Ask the owner before running either command against production.

Run both from `apps/api`, with the Railway CLI linked to this project. The production database is `junction.proxy.rlwy.net`. The script refuses any host other than localhost and the dev database unless `--allow-host` names it. Do not use `npm run db:migrate` against production; migrations apply on every API deploy (`prisma migrate deploy`).

### Load or reload

Removes any old demo rows, then inserts fresh ones. The output is deterministic, so a reload gives identical data.

```bash
railway run --service Postgres -e production sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run seed:learn-demo -- --allow-host junction.proxy.rlwy.net'
```

It prints `Loaded demo tenant: 8 courses, 24 cohorts, ...`. Check that `https://api.interviewdifferently.com/api/learn/public/delaware/catalog` lists courses.

### Remove (do this once the demo period is over, before real participants use the site)

```bash
railway run --service Postgres -e production sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run seed:learn-demo -- --remove --allow-host junction.proxy.rlwy.net'
```

It prints `Removed N institutions and M demo learners`. The same catalog URL should then return 404.

### Local or dev database

`npm run seed:learn-demo` with `DATABASE_URL` pointing at localhost or the Railway dev database (`zephyr.proxy.rlwy.net`) needs no flags.

## Notes

- Regular signed-in users (students) who visit `/builder` will see an "Access restricted" screen.
- Unauthenticated visitors are redirected to `/sign-in` first.
- There is no limit on the number of admin users — any user with `role: "admin"` in their public metadata will have builder access.
