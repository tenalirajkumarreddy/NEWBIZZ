-- =====================================================================
-- 0110_agent_expense_submit
--
-- Lets field agents log their own expenses (fuel/repairs etc.) from the
-- mobile app, pending manager approval. Web parity unchanged: managers
-- keep full expense.manage; approval still moves money only on approval.
--
-- 1. 'expense.submit' permission code + grant to agent/sales roles
-- 2. submit_my_expense(p_header jsonb) -> uuid
--    SECURITY DEFINER clone of record_expense with an agent-shaped gate:
--    has_permission('expense.manage') OR
--    (has_permission('expense.submit') AND source='user_holding' AND
--     user_id = caller). GL account resolved from category server-side.
-- 3. RLS on expenses: users may READ rows they created (created_by = uid)
-- 4. grant execute to authenticated
-- =====================================================================

insert into public.permissions (code, description)
values ('expense.submit', 'Submit own field expenses (pending approval)')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission, scope)
select r.id, 'expense.submit', 'all'
from public.roles r
where r.code in ('agent', 'sales')
on conflict on constraint role_permissions_pkey do nothing;

CREATE OR REPLACE FUNCTION public.submit_my_expense(p_header jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor      uuid := current_app_user();
  v_date       date := coalesce((p_header->>'expense_date')::date, current_date);
  v_fy         uuid := fy_for_date(v_date);
  v_source     expense_source := coalesce((p_header->>'source')::expense_source, 'user_holding');
  v_category   expense_category := (p_header->>'category')::expense_category;
  v_user       uuid := nullif(p_header->>'user_id','')::uuid;
  v_no         text;
  v_id         uuid;
begin
  if v_actor is null then
    raise exception 'submit_my_expense: not authenticated';
  end if;

  if not has_permission('expense.manage') then
    if not has_permission('expense.submit') then
      raise exception 'submit_my_expense: not authorized (expense.submit required)';
    end if;
    if v_source <> 'user_holding' then
      raise exception 'submit_my_expense: field expenses must come from user custody';
    end if;
    if v_user is not null and v_user <> v_actor then
      raise exception 'submit_my_expense: cannot log expenses for another user';
    end if;
    v_user := v_actor;
  end if;

  if not (coalesce(p_header->>'amount','0')::numeric > 0) then
    raise exception 'submit_my_expense: amount must be greater than zero';
  end if;

  -- Field-category account mapping (agent submits category, we resolve the
  -- GL account so they never see the chart of accounts).
  declare
    v_account text := case v_category
      when 'fuel' then '5540'
      when 'repair' then '5540'
      when 'transport' then '5540'
      when 'bank_charges' then '5610'
      else '5530'
    end;
  begin
    v_no := next_number('expense', v_date);
    insert into expenses
      (expense_no, fy_id, expense_date, user_id, category, account_code,
       source, amount, note, bill_url, status, created_by)
    values
      (v_no, v_fy, v_date, v_user, v_category, v_account,
       v_source, (p_header->>'amount')::numeric,
       nullif(p_header->>'note',''),
       nullif(p_header->>'bill_url',''),
       'pending', v_actor)
    returning id into v_id;
  end;

  perform write_audit('insert', 'expenses', v_id::text,
            format('Expense %s submitted via mobile: %s %s', v_no, v_category, (p_header->>'amount')),
            jsonb_build_object('expense_no', v_no, 'amount', (p_header->>'amount')::numeric,
                               'channel', 'mobile'), v_actor);
  return v_id;
end $function$;

CREATE POLICY "read_own_expenses"
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (
    current_app_user() is not null
    AND created_by = current_app_user()
  );

grant execute on function public.submit_my_expense(jsonb) to authenticated;
