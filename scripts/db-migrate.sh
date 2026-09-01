#!/usr/bin/env bash
# =============================================================================
# APPLY MIGRATIONS, IN ORDER, ONCE EACH
#
# package.json has pointed `db:migrate` at scripts/db-migrate.ts since before
# this file existed, and that TypeScript file has never existed — so the one
# command the deployment docs implied was `npm run db:migrate` exited with a
# module-not-found error. The real instruction was prose: "apply
# supabase/migrations/*.sql in filename order".
#
# Prose is fine until there are seventeen of them and the DDL is not idempotent,
# at which point "in filename order" against a live database means
# `create type ... already exists` on the first file.
#
# So this keeps a ledger. public.schema_migrations records what has run; a file
# already in it is skipped; each file is applied inside a single transaction
# together with its ledger row, so a failure halfway leaves neither.
#
#   DATABASE_URL=postgres://...  npm run db:migrate
#
# ADOPTING AN EXISTING DATABASE. A database created before this script has every
# migration applied and an empty ledger, and running blind would try to replay
# 0001. It refuses to do that. Tell it what is already there, once:
#
#   npm run db:migrate -- --adopt-through 0016
#
# which records 0001..0016 as applied without executing them, and leaves 0017
# onwards to be applied normally. Check the highest one your database actually
# has before choosing that number.
#
# Nothing here is destructive: it only ever runs the files in the repository,
# and never drops or rewrites anything on its own account.
# =============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/migrations"
ADOPT_THROUGH=""
DRY_RUN=""

while [ $# -gt 0 ]; do
  case "$1" in
    --adopt-through) ADOPT_THROUGH="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Supabase → Project Settings → Database → Connection string." >&2
  exit 1
fi

psql() { command psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; }

psql -q -c "
  create table if not exists public.schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  );
  alter table public.schema_migrations enable row level security;
" >/dev/null

applied() { psql -tAq -c "select 1 from public.schema_migrations where version = '$1'"; }

if [ -n "$ADOPT_THROUGH" ]; then
  for file in "$DIR"/*.sql; do
    version="$(basename "$file" .sql)"
    [[ "${version%%_*}" > "$ADOPT_THROUGH" ]] && continue
    psql -q -c "insert into public.schema_migrations (version) values ('$version')
                on conflict (version) do nothing" >/dev/null
    echo "adopted  $version"
  done
  echo "Ledger now records everything through $ADOPT_THROUGH. Run again to apply the rest."
  exit 0
fi

# An empty ledger on a database that already has our tables means somebody is
# about to replay 0001 over a live schema. Stop, and say what to do instead.
if [ -z "$(psql -tAq -c 'select 1 from public.schema_migrations limit 1')" ] &&
   [ -n "$(psql -tAq -c "select 1 from information_schema.tables where table_schema='public' and table_name='subscriptions'")" ]; then
  echo "This database already has an Atturel schema but an empty migration ledger." >&2
  echo "Record what is already applied first, e.g.:" >&2
  echo "    npm run db:migrate -- --adopt-through 0016" >&2
  exit 1
fi

pending=0
for file in "$DIR"/*.sql; do
  version="$(basename "$file" .sql)"
  if [ -n "$(applied "$version")" ]; then
    echo "skip     $version"
    continue
  fi
  pending=$((pending + 1))
  if [ -n "$DRY_RUN" ]; then
    echo "would apply  $version"
    continue
  fi
  echo "applying $version"
  # -1 wraps the file AND its ledger row in one transaction: a failure halfway
  # through leaves the database untouched and the version unrecorded.
  psql -1 -q -f "$file" -c "insert into public.schema_migrations (version) values ('$version')"
done

if [ "$pending" -eq 0 ]; then
  echo "Nothing to apply. The database matches supabase/migrations/."
else
  echo "Applied $pending migration(s)."
fi
