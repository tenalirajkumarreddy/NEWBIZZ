-- 0124_company_signature_qr_uploads.sql
-- Invoice print branding: an uploaded signature image (rendered above the
-- Authorised Signatory line) and an uploaded payment-QR image (rendered in the
-- "Pay using UPI" box instead of the generated upi:// QR when present).
-- Files live in the public `party-images` bucket under company/ (existing
-- storage policies cover authenticated uploads; same as avatars).

alter table company_settings
  add column if not exists signature_url text,
  add column if not exists qr_image_url  text;
