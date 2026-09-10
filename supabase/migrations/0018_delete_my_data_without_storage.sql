-- storage.objects refuses direct deletes (storage.protect_delete raises), so
-- the version of delete_my_data in 0017 would have failed on its last step and
-- rolled the whole deletion back. The photo folder is removed through the
-- Storage API by the deletion action before this runs. Everything else is as
-- 0017 defined it.
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
  delete from public.decision_people where user_id = uid;
  delete from public.decisions where user_id = uid;
  delete from public.observation_sources where user_id = uid;
  delete from public.observations where user_id = uid;
  delete from public.commitments where user_id = uid;
  delete from public.notes where user_id = uid;
  delete from public.interaction_participants where user_id = uid;
  delete from public.interactions where user_id = uid;
  delete from public.ai_artifacts where user_id = uid;
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
