-- =====================================================================
-- 0139_integrity_daily_scan.sql
--
-- The reconciliation alarm used to depend on a Vercel cron entry
-- (`/api/cron/integrity` in app/vercel.json). Vercel's Hobby plan allows two
-- cron jobs, each running at most once a day, so that slot is expensive and
-- the alarm would silently disappear if the app were moved or the entry
-- dropped. `0078` already establishes the better pattern for the notification
-- sweep: pg_cron is primary (it runs even if Next.js is down) and the HTTP
-- route is the portable fallback.
--
-- This migration gives the reconciliation checks the same treatment:
--
--   * `integrity_daily_scan()` runs `reconciliation_checks()` and, for every
--     check that is not `ok`, notifies every holder of `accounting.manage`.
--     Notifications are the existing value-event channel, so this reaches the
--     bell, the badge and (through 0114's webhook) the phones — no new
--     delivery mechanism.
--   * It is deduplicated per check per day, so a drift that persists for a
--     week produces one notification a day, not one per run per recipient.
--   * Scheduled at 01:45 UTC, half an hour before the notification sweep, so
--     the alarm is already out before the day's other jobs start.
--
-- Read-only apart from notifications: it never repairs anything. A drift it
-- reports is still a human decision, except for the customer ledger, where
-- `rebuild_customer_ledger()` is the documented repair.
-- =====================================================================

create or replace function public.integrity_daily_scan()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_rcpt     uuid;
  v_checks   int := 0;
  v_drift    int := 0;
  v_notified int := 0;
  v_title    text;
begin
  for r in select * from reconciliation_checks() loop
    v_checks := v_checks + 1;
    continue when r.status = 'ok';

    v_drift := v_drift + 1;

    -- The notification title is the dedup key: `notifications.entity_id` is a
    -- uuid, so a check name cannot be stored there. One notification per check
    -- per day per recipient — a standing drift is news once, not news every run.
    v_title := format('Books do not balance: %s', r.check_name);

    for v_rcpt in select resolve_recipients('accounting.manage') loop
      if exists (select 1
                   from notifications n
                  where n.user_id = v_rcpt
                    and n.category = 'integrity'
                    and n.entity_type = 'reconciliation_check'
                    and n.title = v_title
                    and n.created_at >= current_date
                    and n.status <> 'archived') then
        continue;
      end if;

      perform notify(v_rcpt,
        v_title,
        jsonb_build_object(
          'body', format('Difference %s (expected %s, actual %s). %s',
                         r.difference, r.expected, r.actual, r.detail),
          'severity', 'critical',
          'category', 'integrity',
          'entity_type', 'reconciliation_check',
          'action_url', '/reconciliation'));
      v_notified := v_notified + 1;
    end loop;
  end loop;

  return jsonb_build_object('checks', v_checks, 'drifting', v_drift,
                            'notified', v_notified);
end $$;

comment on function integrity_daily_scan is
  'Daily reconciliation sweep: runs reconciliation_checks() and notifies holders of accounting.manage for each drifting check, once per check per day. Read-only apart from notifications.';

-- Server-side only: pg_cron and the guarded /api/cron/integrity fallback both
-- reach it through the service role.
revoke all on function public.integrity_daily_scan() from public, anon, authenticated;
grant execute on function public.integrity_daily_scan() to service_role;

-- ---------------------------------------------------------------------
-- Schedule — idempotent, same shape as 0078's notification sweep.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule('integrity-daily-scan')
 where exists (select 1 from cron.job where jobname = 'integrity-daily-scan');

select cron.schedule('integrity-daily-scan', '45 1 * * *',
                     $x$select public.integrity_daily_scan()$x$);
