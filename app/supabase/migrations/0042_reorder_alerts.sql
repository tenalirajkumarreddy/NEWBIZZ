-- =====================================================================
-- 0042_reorder_alerts.sql  ·  Phase 1 — Reorder alerts (§4.8)
--
-- Acceptance criterion (§4.8): "Reorder alert fires at ≤ min and notifies
-- operator/manager." Stock quantities only ever change through post_stock_move,
-- which UPDATEs stock.qty_on_hand. We hang a trigger off that UPDATE and, when
-- the on-hand quantity CROSSES DOWN to at/below the item's reorder_level, we
-- notify everyone who can see inventory (resolve_recipients('inventory.view')).
--
-- Only the downward crossing fires (OLD.qty was above the level, NEW.qty is at
-- or below it). A move that leaves an already-low item still low does NOT
-- re-alert — that would spam on every subsequent sale. Restocking above the
-- level re-arms the alert for next time.
--
-- notify() is SECURITY DEFINER and reads the actor from the JWT, so this works
-- inside the sale/transfer transaction without the actor needing any notify
-- permission (unlike notify_by_permission, which self-checks the caller).
-- =====================================================================

create or replace function reorder_alert_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level   numeric(14,3);
  v_name    text;
  v_sku     text;
  v_branch  text;
  v_rcpt    uuid;
begin
  -- Only react to an actual quantity change.
  if new.qty_on_hand is not distinct from old.qty_on_hand then
    return new;
  end if;

  select reorder_level, name, sku into v_level, v_name, v_sku
    from items where id = new.item_id;
  -- No reorder level configured → nothing to watch.
  if v_level is null or v_level <= 0 then
    return new;
  end if;

  -- Fire only on the downward crossing: was above, now at/below.
  if old.qty_on_hand > v_level and new.qty_on_hand <= v_level then
    select name into v_branch from branches where id = new.branch_id;

    for v_rcpt in select resolve_recipients('inventory.view') loop
      perform notify(v_rcpt,
        format('Reorder: %s low at %s', coalesce(v_name, v_sku), coalesce(v_branch,'warehouse')),
        jsonb_build_object(
          'body', format('%s (%s) is at %s, at or below the reorder level of %s.',
                         coalesce(v_name,'Item'), coalesce(v_sku,'—'),
                         trim(to_char(new.qty_on_hand,'FM999999990.###')),
                         trim(to_char(v_level,'FM999999990.###'))),
          'severity', 'warning',
          'category', 'inventory',
          'entity_type', 'item',
          'entity_id', new.item_id::text,
          'action_url', '/stock'));
    end loop;
  end if;

  return new;
end $$;
comment on function reorder_alert_check is 'Fires an inventory notification when stock crosses down to <= reorder_level. §4.8.';

drop trigger if exists stock_reorder_alert on stock;
create trigger stock_reorder_alert
  after update of qty_on_hand on stock
  for each row
  execute function reorder_alert_check();
