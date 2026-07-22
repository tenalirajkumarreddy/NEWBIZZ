# send-sms-hook — Supabase Send SMS Auth Hook (httpSMS)

Delivers phone-OTP SMS for NEWBIZZ auth. Supabase Auth calls this function
**instead of** its built-in SMS sender (Supabase natively supports only
Twilio / Vonage / MessageBird / Textlocal — **not** httpSMS), so httpSMS is
integrated through the **Send SMS Hook**. See platform plan §1.1a.

```
Supabase Auth (OTP requested)
   │  signed POST { user, sms:{ otp } }   (Standard Webhooks)
   ▼
send-sms-hook  (this function)
   │  verifies SEND_SMS_HOOK_SECRET, then:
   │  POST https://api.httpsms.com/v1/messages/send
   │  x-api-key: HTTPSMS_API_KEY
   │  { from: HTTPSMS_FROM, to: user.phone, content: "Your NEWBIZZ code …" }
   ▼
httpSMS → paired Android gateway phone → user
```

## Files
- `index.ts`    — hook entrypoint: verifies the webhook signature, builds the
  OTP text, hands off to the provider, returns empty-200 on success.
- `provider.ts` — vendor abstraction (`SmsProvider`). httpSMS lives here behind
  `getSmsProvider()`; swapping providers touches only this file (plan §1.1a #4).
- `deno.json`   — import map (pins `standardwebhooks`).

## Provider-agnostic by design
The hook never names a vendor. To swap httpSMS for Twilio / MSG91 later: add a
class implementing `SmsProvider` in `provider.ts`, add a `case` in
`getSmsProvider()`, set `SMS_PROVIDER` to its name. **No change** to the auth
model, `users` table, or claims.

## Secrets (Edge Function → Settings → Secrets, NOT Auth provider settings)
| Secret | Meaning |
|---|---|
| `HTTPSMS_API_KEY` | httpSMS API key (httpsms.com → Settings). |
| `HTTPSMS_FROM` | The paired gateway phone's number, **E.164 with `+`** (e.g. `+9198…`). |
| `SEND_SMS_HOOK_SECRET` | The hook secret Supabase generates when you enable the Send SMS hook, form `v1,whsec_<base64>`. Verified on every request. |
| `SMS_PROVIDER` | *(optional)* provider selector; defaults to `httpsms`. |
| `HTTPSMS_ENDPOINT` | *(optional)* override for a self-hosted httpSMS; defaults to the hosted API. |

Set them with the CLI:
```bash
supabase secrets set \
  HTTPSMS_API_KEY=…  HTTPSMS_FROM=+9198XXXXXXXX  SEND_SMS_HOOK_SECRET='v1,whsec_…' \
  --project-ref wmpxwpubfxpexybqnynz
```

## Deploy
This function verifies its **own** auth (the Standard Webhooks hook secret), so
it must NOT sit behind Supabase's user-JWT gate — deploy with JWT verification
**off**:
```bash
supabase functions deploy send-sms-hook --no-verify-jwt \
  --project-ref wmpxwpubfxpexybqnynz
```

## Enable the hook (task 51 — Auth settings)
Dashboard → **Authentication → Hooks → Send SMS** → enable → point at the
`send-sms-hook` function. Copy the generated **hook secret** into
`SEND_SMS_HOOK_SECRET` above. Also enable **Phone** auth and set the OTP
expiry to 5 min (the message text says "Valid 5 min").

## Gateway phone = production infrastructure
Every OTP flows through one Android phone running the httpSMS app. Keep it
charged (mains) and online (stable Wi-Fi). If it is offline, phone logins
stall — keep at least one **Google-linked admin** for break-glass access
(plan §1.1a). P2P SMS carrier limits (~100–200/day) are acceptable for a fixed
staff roster only.

## Local smoke (optional)
```bash
supabase functions serve send-sms-hook --no-verify-jwt --env-file ./.env.local
# then POST a Standard-Webhooks-signed { user:{phone,id}, sms:{otp} } body.
# A correctly signed request returns 200 {} and fires the gateway phone;
# an unsigned/Forged request returns 401 without sending.
```
