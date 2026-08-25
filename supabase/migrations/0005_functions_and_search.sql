create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.subscriptions (user_id, plan) values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();

create extension if not exists "pg_trgm" with schema extensions;

create index people_name_trgm_idx on public.people using gin (full_name extensions.gin_trgm_ops);
create index people_title_trgm_idx on public.people using gin ((coalesce(job_title, '')) extensions.gin_trgm_ops);
create index organizations_name_trgm_idx on public.organizations using gin (name extensions.gin_trgm_ops);
create index meetings_title_trgm_idx on public.meetings using gin (title extensions.gin_trgm_ops);
create index interactions_title_trgm_idx on public.interactions using gin (title extensions.gin_trgm_ops);
create index commitments_desc_trgm_idx on public.commitments using gin (description extensions.gin_trgm_ops);
create index notes_body_trgm_idx on public.notes using gin (body extensions.gin_trgm_ops);
create index observations_content_trgm_idx on public.observations using gin (content extensions.gin_trgm_ops);

-- Global search for the command palette. SECURITY INVOKER, so RLS on the
-- underlying tables scopes every branch to the caller's own rows.
create or replace function public.search_everything(q text, max_results integer default 20)
returns table (
  entity text,
  id uuid,
  title text,
  subtitle text,
  person_id uuid,
  occurred_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = public, extensions
as $fn$
  with needle as (select nullif(trim(q), '') as v)
  select r.entity, r.id, r.title, r.subtitle, r.person_id, r.occurred_at, r.rank
  from (
    select 'person'::text as entity, p.id as id, p.full_name as title,
           (coalesce(p.job_title, '') || case when o.name is not null then ' - ' || o.name else '' end) as subtitle,
           p.id as person_id, p.last_interaction_at as occurred_at,
           (similarity(p.full_name, (select v from needle)) + 0.35)::real as rank
      from public.people p
      left join public.organizations o on o.id = p.organization_id
     where p.archived_at is null
       and (p.full_name ilike '%' || (select v from needle) || '%'
            or p.job_title ilike '%' || (select v from needle) || '%')

    union all
    select 'organization', o.id, o.name, coalesce(o.domain, ''), null::uuid, null::timestamptz,
           (similarity(o.name, (select v from needle)) + 0.2)::real
      from public.organizations o
     where o.name ilike '%' || (select v from needle) || '%'

    union all
    select 'meeting', m.id, m.title, coalesce(m.objective, ''), null::uuid, m.scheduled_at,
           (similarity(m.title, (select v from needle)) + 0.25)::real
      from public.meetings m
     where m.title ilike '%' || (select v from needle) || '%'
        or m.objective ilike '%' || (select v from needle) || '%'

    union all
    select 'interaction', i.id, i.title, coalesce(i.summary, ''), null::uuid, i.occurred_at,
           (similarity(i.title, (select v from needle)) + 0.15)::real
      from public.interactions i
     where i.title ilike '%' || (select v from needle) || '%'
        or i.summary ilike '%' || (select v from needle) || '%'

    union all
    select 'commitment', c.id, c.description, c.status::text, c.person_id, c.due_on::timestamptz,
           (similarity(c.description, (select v from needle)) + 0.1)::real
      from public.commitments c
     where c.description ilike '%' || (select v from needle) || '%'

    union all
    select 'note', n.id, left(n.body, 120), ''::text, n.person_id, n.created_at,
           similarity(left(n.body, 200), (select v from needle))::real
      from public.notes n
     where n.body ilike '%' || (select v from needle) || '%'

    union all
    select 'observation', ob.id, ob.content, ob.evidence_level::text, ob.person_id, ob.last_reinforced_at,
           similarity(ob.content, (select v from needle))::real
      from public.observations ob
     where ob.status = 'active'
       and ob.content ilike '%' || (select v from needle) || '%'
  ) r
  where (select v from needle) is not null
  order by r.rank desc nulls last, r.occurred_at desc nulls last
  limit greatest(1, least(coalesce(max_results, 20), 50));
$fn$;

-- A transparent, inspectable indicator. It measures the state of the USER'S
-- follow-through and contact cadence - never how the other person feels.
create or replace function public.relationship_pulse(target_person uuid)
returns table (
  score integer,
  days_since_contact integer,
  open_commitments integer,
  overdue_commitments integer,
  interaction_count integer,
  has_upcoming boolean
)
language sql
stable
security invoker
set search_path = public
as $fn$
  with stats as (
    select
      (select extract(day from now() - p.last_interaction_at)::integer
         from public.people p where p.id = target_person) as days_since,
      (select count(*)::integer from public.commitments c
        where c.person_id = target_person and c.status = 'open') as open_c,
      (select count(*)::integer from public.commitments c
        where c.person_id = target_person and c.status = 'open'
          and c.due_on is not null and c.due_on < current_date) as overdue_c,
      (select count(*)::integer from public.interaction_participants ip
        where ip.person_id = target_person) as inter_count,
      (select exists (
        select 1 from public.meeting_attendees ma
        join public.meetings m on m.id = ma.meeting_id
        where ma.person_id = target_person and m.status = 'upcoming'
          and (m.scheduled_at is null or m.scheduled_at >= now())
      )) as upcoming
  )
  select
    greatest(0, least(100,
      70
      - least(40, coalesce(stats.days_since, 90) / 3)
      - (stats.overdue_c * 12)
      - (greatest(0, stats.open_c - 2) * 4)
      + least(20, stats.inter_count * 4)
      + (case when stats.upcoming then 10 else 0 end)
    ))::integer,
    coalesce(stats.days_since, -1),
    stats.open_c,
    stats.overdue_c,
    stats.inter_count,
    stats.upcoming
  from stats;
$fn$;

create or replace function public.clear_demo_data()
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.observations where user_id = uid and is_demo;
  delete from public.commitments where user_id = uid and is_demo;
  delete from public.notes where user_id = uid and is_demo;
  delete from public.interactions where user_id = uid and is_demo;
  delete from public.meetings where user_id = uid and is_demo;
  delete from public.ai_artifacts where user_id = uid and is_demo;
  delete from public.people where user_id = uid and is_demo;
  delete from public.organizations where user_id = uid and is_demo;
  delete from public.topics where user_id = uid and is_demo;

  update public.profiles set demo_seeded_at = null where id = uid;
end;
$fn$;

-- Deletes every row the user owns. The auth.users row itself is removed by a
-- privileged caller afterwards, so a failure here never leaves orphaned data.
create or replace function public.delete_my_data()
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.artifact_sources where user_id = uid;
  delete from public.ai_feedback where user_id = uid;
  delete from public.ai_artifacts where user_id = uid;
  delete from public.observation_sources where user_id = uid;
  delete from public.observations where user_id = uid;
  delete from public.commitments where user_id = uid;
  delete from public.notes where user_id = uid;
  delete from public.interaction_participants where user_id = uid;
  delete from public.interactions where user_id = uid;
  delete from public.meeting_attendees where user_id = uid;
  delete from public.external_calendar_events where user_id = uid;
  delete from public.meetings where user_id = uid;
  delete from public.person_topics where user_id = uid;
  delete from public.topics where user_id = uid;
  delete from public.people where user_id = uid;
  delete from public.organizations where user_id = uid;
  delete from public.integration_accounts where user_id = uid;
  delete from public.assessment_responses where user_id = uid;
  delete from public.assessments where user_id = uid;
  delete from public.daily_reflections where user_id = uid;
  delete from public.weekly_reflections where user_id = uid;
  delete from public.usage_events where user_id = uid;
  delete from public.analytics_events where user_id = uid;
  delete from public.profiles where id = uid;
end;
$fn$;

revoke all on function public.search_everything(text, integer) from public;
revoke all on function public.relationship_pulse(uuid) from public;
revoke all on function public.clear_demo_data() from public;
revoke all on function public.delete_my_data() from public;
grant execute on function public.search_everything(text, integer) to authenticated;
grant execute on function public.relationship_pulse(uuid) to authenticated;
grant execute on function public.clear_demo_data() to authenticated;
grant execute on function public.delete_my_data() to authenticated;