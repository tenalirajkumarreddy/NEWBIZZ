-- 0125: company contact channels.
-- The printed invoice's seller block carries "Mobile:" and "Email:" lines
-- (approved Tata-style reference). Until set, those lines simply don't render.
alter table company_settings
  add column if not exists contact_phone text,
  add column if not exists contact_email text;
