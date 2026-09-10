-- =====================================================================
-- 0114_push_webhook
-- Database webhook: notifications INSERT -> edge function send-push
-- (pg_net must be enabled: create extension if not exists pg_net;)
-- =====================================================================
create or replace function public.notify_push_webhook()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform net.http_post(
    url := 'https://wmpxwpubfxpexybqnynz.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('type', 'INSERT', 'table', 'notifications', 'record', to_jsonb(NEW)),
    timeout_milliseconds := 8000
  );
  return NEW;
end;
$$;

drop trigger if exists notifications_push_hook on public.notifications;
create trigger notifications_push_hook
  after insert on public.notifications
  for each row execute function public.notify_push_webhook();
