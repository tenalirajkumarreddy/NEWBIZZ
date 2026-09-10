-- =====================================================================
-- 0112_notif_prefs_write
-- Users manage their own notification preferences from the mobile app.
-- =====================================================================
CREATE POLICY "notif_prefs_write"
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (user_id = current_app_user())
  WITH CHECK (user_id = current_app_user());
