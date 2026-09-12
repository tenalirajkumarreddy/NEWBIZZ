-- =====================================================================
-- 0119_operator_role_expansion
-- Operator (Plant Operator) expansion: sales (cash memos), receipts,
-- orders/challans, staff (workers + same-day attendance + read payroll).
-- =====================================================================
insert into public.permissions (code, description)
values ('attendance.mark', 'Mark daily attendance for the current day')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission, scope)
select r.id, perms.code, 'all'
from public.roles r
join (values
  ('order.view'), ('challan.view'), ('challan.record'),
  ('cashmemo.create'), ('receipt.record'),
  ('hr.view'), ('attendance.mark')
) as perms(code) on true
where r.code = 'operator'
on conflict on constraint role_permissions_pkey do nothing;

-- Operator marks TODAY's attendance only (past days lock automatically).
drop policy if exists "attendance_mark_today" on public.attendance;
create policy "attendance_mark_today"
  on public.attendance
  for all
  to authenticated
  using (has_permission('attendance.mark') and has_permission('hr.view') and work_date = current_date)
  with check (has_permission('attendance.mark') and has_permission('hr.view') and work_date = current_date);

-- Operator may add workers but not edit existing ones (hr.manage stays manager).
drop policy if exists "operator_add_workers" on public.workers;
create policy "operator_add_workers"
  on public.workers
  for insert
  to authenticated
  with check (has_permission('attendance.mark'));

-- First marker of the day opens the calendar day.
drop policy if exists "calendar_mark_today" on public.calendar_days;
create policy "calendar_mark_today"
  on public.calendar_days
  for insert
  to authenticated
  with check (has_permission('attendance.mark') and date = current_date);
