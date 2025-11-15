Midnight logout: server-side implementation (Vercel / GitHub Actions / Supabase)

Goal

Automatically invalidate (sign out) all student sessions at local midnight, without relying on clients visiting the site.

Overview

This repository now contains a serverless endpoint at `api/midnight-logout.js` which when executed will delete sessions from `auth.sessions` for users recorded in `public.users` with `is_admin = false`.

Two recommended deployment options:

1) Vercel Serverless Function (recommended if you host on Vercel)
2) GitHub Actions scheduled workflow (no new hosting required)
3) Supabase Scheduled Function / pg_cron (if you can use server-side scheduling in your Supabase project)

Environment variables

- SUPABASE_DB_CONN (required): a Postgres connection string for your Supabase database. Copy from Supabase -> Settings -> Database -> Connection string (URI) or use a dedicated DB user. Keep it secret.
- SCHEDULE_SECRET (recommended): a random secret string. Set this on your hosting platform and use it when invoking the endpoint (header `X-SCHEDULE-SECRET`). Prevents accidental public invocation.

Vercel setup (step-by-step)

1. Add `SUPABASE_DB_CONN` and `SCHEDULE_SECRET` to your Vercel project Environment Variables (Project Settings -> Environment Variables).
   - For `SUPABASE_DB_CONN` use the Primary DB connection string from Supabase. Example format:
     postgres://postgres:XXXX@db.xxxxx.supabase.co:5432/postgres

2. Deploy the repo to Vercel (connect to GitHub and import the repo). The `api/midnight-logout.js` file will be published as a Serverless Function at:
   https://<your-vercel-app>.vercel.app/api/midnight-logout

3. In the Vercel dashboard, go to Functions -> Cron Jobs (or Integrations -> Cron) and create a job to hit that function daily at 00:00 in your desired timezone.
   - Method: GET or POST
   - URL: https://<your-vercel-app>.vercel.app/api/midnight-logout
   - Add Header: `X-SCHEDULE-SECRET` with the value you set in the environment variable.

4. Test manually:
   - Using curl (locally):

```powershell
# Windows PowerShell example
$env:SUPABASE_DB_CONN = '<your-conn-string>'
$env:SCHEDULE_SECRET = 'testsecret'
curl -H "X-SCHEDULE-SECRET: testsecret" https://<your-vercel-app>.vercel.app/api/midnight-logout
```

Or run locally with Node (for testing only):

```powershell
# Install dependencies
npm install
# Run the function directly (note: the serverless wrapper expects req/res; use the local script option below)
node api/midnight-logout.js
```

GitHub Actions alternative (no hosting required)

1. Store `SUPABASE_DB_CONN` and `SCHEDULE_SECRET` as repository secrets in GitHub (`Settings -> Secrets and variables -> Actions -> New repository secret`).
2. Create a workflow `.github/workflows/midnight-logout.yml` that runs on schedule (cron) at 0 0 * * * in your desired timezone and executes a small Node script that uses `pg` to run the same SQL (or calls the deployed Vercel endpoint with the secret header).

Supabase-native alternative

If you have access to run `pg_cron` or Supabase Scheduled Functions, create a db-level scheduled job executing the DELETE SQL. This runs entirely inside your database and requires no external credentials beyond DB admin access.

SQL used

Delete sessions for users who are not admins (adjust if your schema differs):

```sql
WITH to_kick AS (
  SELECT s.id
  FROM auth.sessions s
  JOIN auth.users u ON u.id = s.user_id
  JOIN public.users p ON p.email = u.email
  WHERE p.is_admin = false
)
DELETE FROM auth.sessions
WHERE id IN (SELECT id FROM to_kick);
```

Security notes

- Never commit service_role keys or DB connection strings to the repo. Use environment variables/secrets.
- Use `SCHEDULE_SECRET` so the endpoint can't be triggered by an anonymous request.
- Consider a dedicated DB user with minimum permissions: the account should be able to DELETE from `auth.sessions` and SELECT from `public.users`.

Support

If you'd like I can:
- Add a GitHub Actions workflow file (`.github/workflows/midnight-logout.yml`) to this repo that runs the SQL nightly (you'll still need to add secrets).
- Add a test helper that shows which sessions would be removed (SELECT variant) before actually running DELETE.

Tell me which option to implement next (Vercel function is already added), and I will either add a GitHub Actions workflow or supply the exact curl commands and Vercel setup steps you should follow.
