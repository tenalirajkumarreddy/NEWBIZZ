-- =====================================================================
-- 0077_bank_credit_card_accounts.sql
--
-- Extends bank_accounts to support credit card accounts alongside
-- regular bank accounts. Credit card statements import the same way
-- but (a) the account is a liability (payable), (b) statement credit
-- means purchases (outflow), debit means payments (inflow), and
-- (c) the recon report treats the balance as outstanding.
-- =====================================================================

alter table bank_accounts
  add column if not exists account_type    text not null default 'bank'
    check (account_type in ('bank', 'credit_card')),
  add column if not exists credit_limit    numeric(14,2),
  add column if not exists payment_due_day int,
  add column if not exists card_last_four  text;

comment on column bank_accounts.account_type    is '"bank" or "credit_card" — affects sign convention in reconciliation';
comment on column bank_accounts.credit_limit    is 'Credit limit (credit cards only)';
comment on column bank_accounts.payment_due_day is 'Day of month payment is due (credit cards only)';
comment on column bank_accounts.card_last_four  is 'Last 4 digits of card number (credit cards only)';

-- Credit Card Payable liability account
insert into chart_of_accounts (code, name, type, normal_side, is_postable, is_system, status, parent_id)
values ('2101', 'Credit Card Payable', 'liability', 'credit', true, true, 'active',
        (select id from chart_of_accounts where code = '2100'))
on conflict (code) do nothing;
