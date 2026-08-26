-- Estimated provider cost, in millionths of a US dollar.
--
-- Stored rather than computed on read, because vendor prices change and a
-- historical row should keep the cost it actually incurred. Integer micros
-- rather than a float: a brief costs a fraction of a cent, and summing
-- thousands of floats that small loses precision exactly where the answer
-- matters.
--
-- Internal only. Nothing user-facing reads this column -- users see quotas and
-- plan limits, never what a provider charged.
alter table public.usage_meters
  add column if not exists estimated_cost_micros bigint not null default 0;

-- Exa request counts, so one table answers "what did this cost" without
-- joining research_jobs. Search requests are billed per call regardless of how
-- many results come back, which is why the count is what is stored.
alter table public.usage_meters
  add column if not exists search_requests integer not null default 0;

comment on column public.usage_meters.estimated_cost_micros is
  'Estimated provider cost in USD millionths, from model token pricing plus search requests at the time the work ran. Internal cost accounting only -- never exposed to users.';

comment on column public.usage_meters.search_requests is
  'Billable search-provider calls made for this unit of work. Exa bills per request, not per result.';

-- Cost per feature, per user, per period. A view rather than a dashboard: the
-- brief for the pilot is measurement, not a product surface.
create or replace view public.usage_cost_summary as
select
  user_id,
  workspace_id,
  period_start,
  kind,
  count(*)                              as runs,
  sum(quantity)                         as quantity,
  sum(search_requests)                  as search_requests,
  sum(coalesce(input_tokens, 0))        as input_tokens,
  sum(coalesce(output_tokens, 0))       as output_tokens,
  sum(estimated_cost_micros)            as cost_micros,
  round(sum(estimated_cost_micros) / 1000000.0, 4) as cost_usd,
  round(sum(estimated_cost_micros) / nullif(count(*), 0) / 1000000.0, 4) as cost_usd_per_run
from public.usage_meters
group by user_id, workspace_id, period_start, kind;

-- The view inherits RLS from usage_meters through security_invoker, so a user
-- can only ever see their own rows and operators query it with the service key.
alter view public.usage_cost_summary set (security_invoker = on);
