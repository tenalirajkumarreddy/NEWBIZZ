-- 0126_company_logo.sql
-- Brand logo for printed documents: an uploaded logo replaces the bundled
-- /brand/logo.png in every print letterhead (invoice, challan, credit note).
-- Files live in the public `party-images` bucket under company/ (same policy
-- family as the signature/QR uploads from 0124).
alter table company_settings
  add column if not exists logo_url text;
