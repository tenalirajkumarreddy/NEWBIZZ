-- 0123_company_bank_details.sql
-- Bank details for printed documents (invoice template, reference: Zoho-style
-- GST invoice). Single-row company_settings gains the remittance block plus an
-- optional UPI id; the print page renders a UPI payment QR from it and the
-- document QR from lib/qr.ts — two different QRs, two different jobs.
-- Values are user-entered (admin settings form) — nothing here is auto-detected.

alter table company_settings
  add column if not exists bank_name     text,
  add column if not exists bank_account_no text,
  add column if not exists bank_ifsc     text,
  add column if not exists bank_branch   text,
  add column if not exists upi_id        text;
