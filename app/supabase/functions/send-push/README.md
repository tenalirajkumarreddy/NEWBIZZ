# send-push

Delivers an FCM v1 notification to every device registered to a user.

**Trigger.** `0114_push_webhook.sql` installs an `after insert` trigger on
`public.notifications` that calls `net.http_post()` to this function with the
new row. Nothing in the app calls it directly, and `verify_jwt` is off because
the caller is the database, not a signed-in user.

**Secrets** (Supabase dashboard → Edge Functions → Secrets):

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase service-account key JSON, raw or base64 |
| `FIREBASE_PROJECT_ID` | Firebase project id |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform.

**Behaviour.** Skips rows that are not `unread` and users with no tokens. Dead
tokens (FCM 404/410) are deleted from `push_tokens` on the way out. Missing
secrets return `200` with `not configured` rather than failing, so a project
without Firebase configured does not retry-storm the webhook.

**Provenance.** This source was pulled from the deployed function
(`get_edge_function`, version 3, 2026-10-21) because the repository did not
contain it while `0114` already pointed at it — a rebuild would have created a
webhook calling a function that did not exist.

> Note: `0114_push_webhook.sql` hardcodes the project ref
> `wmpxwpubfxpexybqnynz` in the URL, so a database built for any other project
> posts notifications back to NEWBIZZ. That needs the ref substituted before
> the function is useful elsewhere.
