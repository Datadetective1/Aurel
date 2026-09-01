# Deployment

Vercel plus Supabase, though nothing here is Vercel-specific beyond the build
command.

## First deploy

1. **Create the Supabase project.** Apply the migrations:

   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   ```

   They are dependent and must run in filename order, which is what the runner
   does. It records each one in `public.schema_migrations` as it goes, so
   running it again is a no-op rather than a pile of `already exists` errors.

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

`npm run db:migrate` applies whatever has not run yet. `public.schema_migrations`
is the source of truth for what HAS run; `supabase/migrations/` is the source of
truth for what should have. Those two agreeing is worth checking before a
release — they diverged once in this project, and the repository could not
recreate its own schema.

**A database created before that ledger existed has an empty one**, and the
runner refuses to replay `0001` over a live schema rather than guessing. Tell it
what is already there, once, after checking the highest migration the database
actually has:

```bash
npm run db:migrate -- --adopt-through 0016   # records 0001..0016 without running them
npm run db:migrate                            # then applies 0017 onwards normally
```

`--dry-run` lists what would be applied and touches nothing.

Every file is applied inside a single transaction together with its ledger row,
so a migration that fails halfway leaves neither a partial schema nor a false
record of success.

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
