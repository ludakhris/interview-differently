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

## Notes

- Regular signed-in users (students) who visit `/builder` will see an "Access restricted" screen.
- Unauthenticated visitors are redirected to `/sign-in` first.
- There is no limit on the number of admin users — any user with `role: "admin"` in their public metadata will have builder access.
