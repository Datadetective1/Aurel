# Deployment

Vercel plus Supabase, though nothing here is Vercel-specific beyond the build
command.

## First deploy

1. **Create the Supabase project.** Apply `supabase/migrations/*.sql` in
   filename order — they are dependent.

2. **Verify the boundary before anything else:**

   ```bash
   psql "$DATABASE_URL" -f supabase/tests/rls-isolation.sql
   ```

   Two users, isolation asserted both ways, transaction rolled back. If it
   fails, stop. Row level security is the security model here.

3. **Set environment variables** in the host's settings, not in a file.
   `.env.production` is committed and contains only the Supabase URL and
   publishable key — both already ship in the JavaScript every visitor
   downloads, and RLS is what actually protects the data. Host settings
   override it.

   The build fails loudly on a missing or invalid `NEXT_PUBLIC_*` value. That
   is deliberate: Next.js inlines those at build time, so a deployment missing
   one produces a broken app rather than an error.

4. **Set `NEXT_PUBLIC_SITE_URL`** to the real origin. OAuth redirects, Stripe
   return URLs, email links and canonical metadata all read it. A wrong value
   here gives you working pages with broken links out — the kind of failure
   nobody notices until a customer does.

5. **Add the production redirect URL** in Supabase Auth, or sign-in emails will
   send people to localhost.

6. Optional credentials are in [HUMAN_ACTIONS.md](HUMAN_ACTIONS.md). None block
   launch; each turns on one capability, and Settings → Capabilities tells the
   user which are running.

## Migrations

Forward-only, numbered, no down migrations. A down migration for a schema
carrying real relationship data is a way to lose it under pressure; restore from
a snapshot instead.

Applying to an existing database: the migration table is the source of truth for
what has run. `supabase/migrations/` is the source of truth for what *should*
have. Those two agreeing is worth checking before a release — they diverged once
in this project, and the repository could not recreate its own schema.

## After deploying

- Load the site and confirm both themes render
- Sign up, complete onboarding, add a person, open a brief
- Check Settings → Capabilities matches what you configured
- If Stripe is on, run one real subscribe and confirm the plan changes — the
  webhook is the only thing that grants entitlement, so if it is misconfigured
  a payment succeeds and nothing happens

## Rollback

Redeploy the previous build. Migrations are forward-only, so a rollback of code
against a newer schema must be checked: additive migrations are safe to roll
back past, destructive ones are not. Nothing in this project has been
destructive so far.
