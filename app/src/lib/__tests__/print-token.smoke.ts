// =====================================================================
// lib/__tests__/print-token.smoke.ts — token roundtrip + abuse cases.
//
// The web app intentionally has no jest config (mobile owns the unit-test
// setup), so this is a plain runnable smoke: every case sets a flag, and the
// file exits non-zero on any failure. Run with tsx:
//   cd app && npx tsx src/lib/__tests__/print-token.smoke.ts
// (also valid under `node --experimental-strip-types` on Node 22+).
// =====================================================================

import { mintPrintToken, verifyPrintToken, printShareHref } from "../print-token";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    console.error(`FAIL  ${name}`);
    failures++;
  }
}

const KIND = "invoice" as const;
const DOC = "123e4567-e89b-12d3-a456-426614174000";

// 1. Roundtrip: mint → verify returns the same kind/doc.
const t = mintPrintToken(KIND, DOC);
const v = verifyPrintToken(t, KIND, DOC);
check("roundtrip kind", v?.kind === KIND);
check("roundtrip docId", v?.docId === DOC);
check("no carried sign by default", v?.sign === undefined);

// 2. Expiry in the past → rejected.
const expired = mintPrintToken(KIND, DOC, { expiresInSeconds: -10 });
check("expired token rejected", verifyPrintToken(expired, KIND, DOC) === null);

// 3. Tamper: flip a character in the payload → signature mismatch.
const tampered =
  t.slice(0, 4) + (t[4] === "A" ? "B" : "A") + t.slice(5);
check("tampered payload rejected", verifyPrintToken(tampered, KIND, DOC) === null);

// 4. Truncated/garbage tokens rejected without throwing.
check("garbage rejected", verifyPrintToken("garbage", KIND, DOC) === null);
check("empty rejected", verifyPrintToken("", KIND, DOC) === null);
check("undefined rejected", verifyPrintToken(undefined, KIND, DOC) === null);

// 5. Cross-kind and cross-document bindings.
const challanToken = mintPrintToken("challan", DOC);
check("kind binding", verifyPrintToken(challanToken, "credit-note", DOC) === null);
const otherDoc = "00000000-0000-4000-8000-000000000001";
check("doc binding", verifyPrintToken(t, KIND, otherDoc) === null);

// 6. sign choice round-trips and is visible to the route.
const withSign = mintPrintToken(KIND, DOC, { sign: "0" });
check("sign=0 carried", verifyPrintToken(withSign, KIND, DOC)?.sign === "0");

// 7. Share href shape (what the APK/mobile mints or a user copies).
const href = printShareHref(KIND, DOC, { sign: "0" });
check(
  "share href shape",
  href.startsWith(`/print/${KIND}/${DOC}?`) && href.includes("t=") && href.includes("sign=0"),
);
const hrefToken = new URL(`https://x.test${href}`).searchParams.get("t") ?? "";
check("share href token verifies", verifyPrintToken(hrefToken, KIND, DOC)?.sign === "0");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll print-token checks passed.");
