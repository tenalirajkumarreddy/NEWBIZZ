// =====================================================================
// provider.ts  —  SMS provider abstraction for the Send SMS Auth Hook.
//
// The whole point of this module is SWAPPABILITY (platform plan §1.1a #4):
// the auth hook never talks to a vendor directly. It asks getSmsProvider()
// for something that can `send(to, content)` and nothing else. Swapping
// httpSMS for Twilio / MSG91 later = add a class here and flip SMS_PROVIDER;
// index.ts, the users table, the claims, and the auth model are untouched.
//
// Phone numbers are E.164 WITH the leading '+' at this layer (that is what
// the Supabase hook payload's user.phone carries, and what httpSMS expects).
// The "+"-less normalization concern lives in the DB trigger / app invitation
// layer, NOT here.
// =====================================================================

/** Raised when a provider fails to hand the message off. httpStatus is
 *  surfaced to Supabase Auth so it can decide whether to retry. */
export class SmsSendError extends Error {
  readonly httpStatus: number;
  readonly providerCode?: string;
  constructor(message: string, httpStatus = 502, providerCode?: string) {
    super(message);
    this.name = "SmsSendError";
    this.httpStatus = httpStatus;
    this.providerCode = providerCode;
  }
}

/** The only surface the hook depends on. Keep it minimal on purpose. */
export interface SmsProvider {
  readonly name: string;
  /** Deliver `content` to `to` (E.164, with '+'). `requestId` is an optional
   *  idempotency key the provider may use to de-dupe retries. Throws
   *  SmsSendError on any non-success. */
  send(to: string, content: string, requestId?: string): Promise<void>;
}

// ---------------------------------------------------------------------
// httpSMS — routes SMS through a paired Android gateway phone.
// Contract (verified): POST https://api.httpsms.com/v1/messages/send,
// header x-api-key, JSON { from, to, content, request_id? }, success ->
// { status: "success" }.
// ---------------------------------------------------------------------
class HttpSmsProvider implements SmsProvider {
  readonly name = "httpsms";
  readonly #apiKey: string;
  readonly #from: string;
  readonly #endpoint: string;

  constructor() {
    const apiKey = Deno.env.get("HTTPSMS_API_KEY");
    const from = Deno.env.get("HTTPSMS_FROM");
    if (!apiKey) throw new SmsSendError("HTTPSMS_API_KEY is not configured", 500);
    if (!from) throw new SmsSendError("HTTPSMS_FROM is not configured", 500);
    this.#apiKey = apiKey;
    this.#from = from;
    // Overridable so a self-hosted httpSMS can be pointed at without a code change.
    this.#endpoint = Deno.env.get("HTTPSMS_ENDPOINT") ??
      "https://api.httpsms.com/v1/messages/send";
  }

  async send(to: string, content: string, requestId?: string): Promise<void> {
    const body: Record<string, unknown> = { from: this.#from, to, content };
    if (requestId) body.request_id = requestId;

    let res: Response;
    try {
      res = await fetch(this.#endpoint, {
        method: "POST",
        headers: {
          "x-api-key": this.#apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // Network / DNS / TLS failure reaching httpSMS.
      throw new SmsSendError(`httpSMS unreachable: ${String(e)}`, 502);
    }

    // httpSMS returns 2xx with { status: "success" } on accept.
    let payload: { status?: string; message?: string } = {};
    try {
      payload = await res.json();
    } catch {
      // Non-JSON body; fall back to status-code judgement below.
    }

    if (!res.ok || (payload.status && payload.status !== "success")) {
      throw new SmsSendError(
        `httpSMS rejected the message: ${payload.message ?? res.statusText}`,
        // 401 (bad/missing key) is a config error, not a transient one — pass
        // it through so it is visible; everything else is a bad gateway.
        res.status === 401 ? 401 : 502,
        payload.status,
      );
    }
  }
}

/**
 * Select the active provider from SMS_PROVIDER (default: httpsms).
 * Add new vendors as their own class and a case here — nothing else changes.
 */
export function getSmsProvider(): SmsProvider {
  const which = (Deno.env.get("SMS_PROVIDER") ?? "httpsms").toLowerCase();
  switch (which) {
    case "httpsms":
      return new HttpSmsProvider();
    default:
      throw new SmsSendError(`Unknown SMS_PROVIDER "${which}"`, 500);
  }
}
