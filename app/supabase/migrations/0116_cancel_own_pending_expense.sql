-- =====================================================================
-- 0116_cancel_own_pending_expense
-- Submitters can withdraw their own expense while it is still pending
-- (ledger-neutral: money moves only on approval).
-- =====================================================================
create policy "cancel_own_pending_expense"
  on public.expenses
  for delete
  to authenticated
  using (created_by = current_app_user() and status = 'pending');
