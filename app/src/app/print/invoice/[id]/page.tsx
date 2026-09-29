import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { verifyPrintToken } from "@/lib/print-token";
import { createServiceClient } from "@/lib/supabase/service";
import { getInvoice, type InvoiceLine } from "@/lib/data/sales";
import { getCompany } from "@/lib/data/settings";
import { dateIST, money, qty as fmtQty } from "@/lib/format";
import { docQrSvg, upiQrSvg } from "@/lib/qr";

export const dynamic = "force-dynamic";

// Printable GST invoice — proportion-matched to the approved reference sheet
// (tax-invoice.html): boxed full-frame A4, blue centred TAX INVOICE band with
// ORIGINAL FOR RECIPIENT corner, header grid (seller w/ Mobile+Email | Invoice
// #/POS | Date/Due), Customer Details + Shipping address cells, lines table
// (Rate/Item, Qty, Taxable Value, Tax Amount (rate%), Amount), in-table totals
// footer ("Total Items / Qty" + Taxable/IGST rows + bold Total), "INR … Rupees
// Only." words row, HSN/SAC-wise tax summary, green-check Amount Paid strip,
// Bank | UPI-QR | Signature band, Notes | Terms band, and the digitally-signed
// footer line.
//
// GEOMETRY — the reference is authored on a 920px canvas; this sheet is true
// A4. SCALE converts every reference px value (fonts, paddings, gaps, heights)
// so the reference's exact rhythm lands on paper without re-proportioning
// anything. Grid tracks / table columns are percentages cloned from the same
// 920px canvas, so they breathe identically at any width.
const BLUE = "#2b5aa8";
const GREEN = "#22a559";
const INK = "#222222";
const INK2 = "#333333";
const INK4 = "#555555";
const BORDER = "#666666";
const MONO = 'var(--font-mono, ui-monospace, "SF Mono", monospace)';
const SANS = 'var(--font-sans, "Helvetica Neue", Arial, sans-serif)';

// 210mm at 96dpi = 793.70px; sheet keeps an 8mm margin (the reference's own
// print margin) and a 2px frame, leaving 729.23px of content vs the reference's
// 916px.
const SCALE = 0.796;
const px = (n: number) => n * SCALE;

export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { sign?: string; t?: string };
}) {
  // Two ways in: a web session with invoice.view, or a valid share token for
  // THIS invoice (the APK's "Open full document" — browser has no session).
  const session = await getSession();
  const token = verifyPrintToken(searchParams.t, "invoice", params.id);
  if (!session && !token) redirect("/login");
  if (session && !token && !can(session.claims, "invoice.view")) notFound();

  // `?sign=0` renders the sheet WITHOUT the stored signature image — the
  // signature area stays blank for a wet-ink signature on paper. Tokens may
  // carry the choice so the shared URL round-trips it; explicit ?sign wins.

  // Signature visibility: an explicit ?sign=0 wins; else the token's carried
  // choice (so the share link round-trips the without-sign sheet); else signed.
  const signParam = searchParams.sign ?? token?.sign;
  const showSignature = signParam !== "0";

  // Token-authed reads bypass RLS deliberately: the share token IS the
  // authorization (HMAC-bound to this exact document, expiry-checked) — RLS
  // has no session to evaluate and would null the fetch. Session paths keep
  // the RLS-scoped cookie client.
  const db = token ? createServiceClient() : undefined;
  const [inv, company] = await Promise.all([getInvoice(params.id, db), getCompany()]);
  if (!inv) notFound();

  const docQr = await docQrSvg("inv", inv.id, 44);
  const upiQr =
    company?.upiId && inv.grandTotal > 0 && inv.status !== "void"
      ? await upiQrSvg({
          upiId: company.upiId,
          name: company.tradeName ?? company.legalName,
          amount: inv.grandTotal,
          note: `Invoice ${inv.invoice_no}`,
          size: px(122),
        })
      : null;

  const payBox = Boolean(company?.qrImageUrl) || upiQr !== null;
  const rateGroups = groupByHsn(inv.lines);
  const words = inrWordsExact(inv.grandTotal);
  const dueDate = addDays(inv.invoice_date, inv.creditDays);
  const totalQty = inv.lines.reduce((s, l) => s + l.qty, 0);
  const taxableSum = inv.lines.reduce((s, l) => s + l.taxable_amount, 0);
  const rates = [...new Set(inv.lines.map((l) => Number(l.gst_rate) || 0))];
  const rateSuffix = rates.length === 1 && rates[0] > 0 ? ` ${(rates[0]).toFixed(1)}%` : "";
  // CGST/SGST are each half the headline rate (18% GST → 9% CGST + 9% SGST).
  const halfRateSuffix = rates.length === 1 && rates[0] > 0 ? ` ${(rates[0] / 2).toFixed(2).replace(/\.00$/, "")}%` : "";

  const bank = company?.bankName
    ? {
        name: company.bankName,
        account: company.bankAccountNo ?? "\u2014",
        ifsc: company.bankIfsc ?? "\u2014",
        branch: company.bankBranch ?? "\u2014",
      }
    : null;
  const sellerName = company?.tradeName ?? company?.legalName ?? "NEWBIZZ";

  // Reference column ratios (its 920px canvas) as percentages so the grid
  // breathes identically at A4 width.
  const ITEMS_COLS = ["4.5%", "28.7%", "8.9%", "13.3%", "9.9%", "11.2%", "12.2%", "11.3%"];
  const hsnCols = inv.isInterstate
    ? ["23.9%", "13.9%", "23.9%", "23.9%", "14.4%"]
    : ["18%", "12%", "10%", "15%", "10%", "15%", "20%"];

  // The sheet renders twice: the recipient copy is what the application shows
  // (and page 1 of the print job); the office copy re-renders the identical
  // document for the office file and exists ONLY in the browser's print
  // window — the copy rules at the bottom of this page hide it on screen and
  // start it on its own sheet.
  const renderSheet = (copyLabel: string) => (
    <div
      className="print-sheet"
      style={{
        width: "210mm",
        // 296mm, not 297mm: at @page margin 0 a 297mm block sits exactly on
        // the page box, and fractional-px rounding at print DPI spills an
        // empty trailing page. 1mm short is invisible on screen and kills the
        // blank-page risk on paper.
        minHeight: "296mm",
        padding: "8mm",
        margin: "0 auto",
        background: "#ffffff",
        color: INK,
        fontFamily: SANS,
        fontSize: px(14),
        lineHeight: 1.3,
        boxSizing: "border-box",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <div style={{ border: "2px solid #222" }}>

        {/* title band: centred blue TAX INVOICE, copy-type top-right */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            height: px(30),
            borderBottom: "1px solid #222",
            padding: `0 ${px(8)}px`,
          }}
        >
          <span />
          <span style={{ color: BLUE, fontWeight: 600, fontSize: px(16), letterSpacing: "0.2em" }}>
            {inv.isOfficial ? "TAX INVOICE" : "CASH MEMO"}
          </span>
          <span
            style={{
              gridColumn: 3,
              textAlign: "right",
              fontSize: px(11.5),
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: INK2,
            }}
          >
            {copyLabel}
          </span>
        </div>

        {/* header grid: seller + customer | meta + shipping */}
        <div style={{ display: "grid", gridTemplateColumns: "49.8% 1fr" }}>
          <div style={{ borderRight: "1px solid #222" }}>
            <div
              style={{
                display: "flex",
                gap: px(16),
                padding: px(10),
                height: px(140),
                borderBottom: "1px solid #222",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={company?.logoUrl ?? "/brand/logo.png"}
                alt=""
                style={{
                  width: px(120),
                  maxHeight: px(120),
                  height: "auto",
                  flexShrink: 0,
                  alignSelf: "flex-start",
                  objectFit: "contain",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: px(16.5), fontWeight: 700, lineHeight: 1.25, marginBottom: px(2) }}>
                  {sellerName}
                </div>
                <div style={{ lineHeight: `${px(18)}px`, fontSize: px(14), color: "#2a2a2a" }}>
                  {company?.primaryGstin && (
                    <>
                      <b>GSTIN {company.primaryGstin}</b>
                      <br />
                    </>
                  )}
                  {company?.address &&
                    company.address.split("\n").map((line, i) => (
                      <span key={i}>
                        {line}
                        <br />
                      </span>
                    ))}
                  {company?.contactPhone && (
                    <>
                      <b>Mobile</b> {company.contactPhone}
                      <br />
                    </>
                  )}
                  {company?.contactEmail && (
                    <>
                      <b>Email</b> {company.contactEmail}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: px(10), fontSize: px(13.5), lineHeight: `${px(17.9)}px` }}>
              <b>Customer Details:</b>
              <br />
              <b>{inv.customerName ?? "\u2014"}</b>
              <br />
              <b>Billing address:</b>
              <br />
              {inv.storeAddress
                ? inv.storeAddress.split("\n").map((line, i) => (
                    <span key={i}>
                      {line}
                      <br />
                    </span>
                  ))
                : "\u2014"}
              {(inv.storePhone || inv.customerPhone) && <>Ph: {inv.storePhone ?? inv.customerPhone}</>}
            </div>
          </div>

          <div>
            <div style={{ display: "grid", gridTemplateColumns: "49.5% 1fr" }}>
              <MetaCell label="Invoice #:" value={inv.invoice_no} strong divider />
              <MetaCell label="Invoice Date:" value={dateIST(inv.invoice_date)} strong />
              <MetaCell label="Place of Supply:" value={inv.placeOfSupply} strong divider />
              <MetaCell label="Due Date:" value={dueDate ? dateIST(dueDate) : "On receipt"} />
            </div>
            <div style={{ padding: `${px(10)}px ${px(8)}px`, fontSize: px(14), lineHeight: `${px(21)}px` }}>
              <div style={{ fontWeight: 600, color: INK2 }}>Shipping address:</div>
              {[inv.storeName, inv.storeAddress].filter(Boolean).length > 0
                ? [inv.storeName, inv.storeAddress].filter(Boolean).join("\n").split("\n").map((line, i) => (
                    <span key={i}>
                      {line}
                      <br />
                    </span>
                  ))
                : "\u2014"}
              {inv.orderNo && (
                <div style={{ marginTop: px(2), fontSize: px(12), color: INK4, fontFamily: MONO }}>
                  Against order {inv.orderNo}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* lines table — vertical rules on every column but the first */}
        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", borderTop: "1px solid #222" }}>
          <colgroup>
            {ITEMS_COLS.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th style={thS(false, false)}>{"#"}</th>
              <th style={thS(false)}>Item</th>
              <th style={thS(false)}>HSN/SAC</th>
              <th style={thS(true)}>Rate/ Item</th>
              <th style={thS(true)}>Qty</th>
              <th style={thS(true)}>Taxable Value</th>
              <th style={thS(true)}>Tax Amount</th>
              <th style={thS(true)}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={l.id}>
                <td style={tdS(false, false)}>{i + 1}</td>
                <td style={tdS(false)}>
                  <b>{l.itemName ?? "\u2014"}</b>
                  {l.sku && <div style={{ fontSize: px(13), color: INK4 }}>{l.sku}</div>}
                </td>
                <td style={tdS(false)}>{l.hsnCode ?? "\u2014"}</td>
                <td style={tdS(true)}>
                  <b>{money(l.unit_price)}</b>
                </td>
                <td style={tdS(true)}>{fmtQty(l.qty)}</td>
                <td style={tdS(true)}>{money(l.taxable_amount)}</td>
                <td style={tdS(true)}>
                  {money(l.cgst_amount + l.sgst_amount + l.igst_amount + l.cess_amount)}
                  {Number(l.gst_rate) > 0 && inv.isOfficial && (
                    <div style={{ fontSize: px(13), color: INK4 }}>
                      ({Number(l.gst_rate).toFixed(0)}% GST)
                    </div>
                  )}
                </td>
                <td style={tdS(true)}>{money(l.line_total)}</td>
              </tr>
            ))}
            {/* tall filler so short invoices still fill the sheet like the reference */}
            {inv.lines.length < 5 && (
              <tr>
                {Array.from({ length: 8 }).map((_, i) => (
                  <td key={i} style={{ height: px(196), padding: 0, borderLeft: i > 0 ? `1px solid ${BORDER}` : undefined }} />
                ))}
              </tr>
            )}
          </tbody>
        </table>

        {/* totals footer — full-width rules under every row after the first */}
        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", borderTop: "2px solid #222" }}>
          <colgroup>
            <col style={{ width: "65.3%" }} />
            <col style={{ width: "12.5%" }} />
            <col style={{ width: "22.2%" }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={totFirst}>Total Items / Qty : {inv.lines.length} / {fmtQty3(totalQty)}</td>
              <td style={totLabelFirst}>Taxable Amount</td>
              <td style={totValFirst}>{money(taxableSum)}</td>
            </tr>
            {inv.isInterstate
              ? inv.igstAmount > 0 && <TotRow label={`IGST${rateSuffix}`} val={money(inv.igstAmount)} />
              : (
                <>
                  {inv.cgstAmount > 0 && (
                    <TotRow label={`CGST${halfRateSuffix}`} val={money(inv.cgstAmount)} />
                  )}
                  {inv.sgstAmount > 0 && (
                    <TotRow label={`SGST${halfRateSuffix}`} val={money(inv.sgstAmount)} />
                  )}
                </>
              )}
            {inv.cessAmount > 0 && <TotRow label="Cess" val={money(inv.cessAmount)} />}
            {inv.roundOff !== 0 && <TotRow label="Round Off" val={money(inv.roundOff)} />}
            <tr>
              <td style={totBorderedPlain} />
              <td style={totGrandLabel}>Total</td>
              <td style={totGrandVal}>{money(inv.grandTotal)}</td>
            </tr>
          </tbody>
        </table>

        {words && (
          <div style={{ borderTop: "1px solid #222", padding: `${px(2)}px ${px(8)}px`, fontSize: px(12.5), color: INK }}>
            Total amount (in words): {words}
          </div>
        )}

        {/* HSN/SAC-wise tax summary */}
        {inv.isOfficial && rateGroups.length > 0 && (
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", borderTop: "1px solid #222" }}>
            <colgroup>
              {hsnCols.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} style={hsnTh("left", false)}>HSN/SAC</th>
                <th rowSpan={2} style={hsnTh("right")}>Taxable Value</th>
                <th colSpan={2} style={{ ...hsnTh("center"), textAlign: "center" }}>{inv.isInterstate ? "Integrated Tax" : "Central Tax"}</th>
                {!inv.isInterstate && <th colSpan={2} style={{ ...hsnTh("center"), textAlign: "center" }}>State Tax</th>}
                <th rowSpan={2} style={hsnTh("right")}>Total Tax Amount</th>
              </tr>
              <tr>
                <th style={hsnTh("center")}>Rate</th>
                <th style={hsnTh("center")}>Amount</th>
                {!inv.isInterstate && (
                  <>
                    <th style={hsnTh("center")}>Rate</th>
                    <th style={hsnTh("center")}>Amount</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rateGroups.map((g, i) => {
                const central = inv.isInterstate ? g.igst : g.cgst;
                // IGST carries the full headline rate; CGST and SGST each carry
                // half of it (5% GST → 2.5% Central + 2.5% State).
                const centralRate = inv.isInterstate ? g.rate : g.rate / 2;
                const fmtPct = (r: number) => `${r.toFixed(2).replace(/\.00$/, "")}%`;
                return (
                  <tr key={`${g.hsn}-${g.rate}-${i}`}>
                    <td style={hsnTd("left", false)}>{g.hsn ?? "\u2014"}</td>
                    <td style={hsnTd("right")}>{g.taxable.toFixed(2)}</td>
                    <td style={hsnTd("center")}>{fmtPct(centralRate)}</td>
                    <td style={hsnTd("center")}>{central.toFixed(2)}</td>
                    {!inv.isInterstate && (
                      <>
                        {/* CGST/SGST each carry half the headline GST rate. */}
                        <td style={hsnTd("center")}>{fmtPct(g.rate / 2)}</td>
                        <td style={hsnTd("center")}>{g.sgst.toFixed(2)}</td>
                      </>
                    )}
                    <td style={hsnTd("right")}>{(inv.isInterstate ? g.igst : g.cgst + g.sgst).toFixed(2)}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ ...hsnTd("right", true), textAlign: "right", borderBottom: 0 }}>TOTAL</td>
                <td style={{ ...hsnTd("right", true), borderBottom: 0 }}>{taxableSum.toFixed(2)}</td>
                <td style={{ ...hsnTd("center", true), borderBottom: 0 }}>-</td>
                <td style={{ ...hsnTd("center", true), borderBottom: 0 }}>{(inv.isInterstate ? inv.igstAmount : inv.cgstAmount).toFixed(2)}</td>
                {!inv.isInterstate && (
                  <>
                    <td style={{ ...hsnTd("center", true), borderBottom: 0 }}>-</td>
                    <td style={{ ...hsnTd("center", true), borderBottom: 0 }}>{inv.sgstAmount.toFixed(2)}</td>
                  </>
                )}
                <td style={{ ...hsnTd("right", true), borderBottom: 0 }}>{(inv.isInterstate ? inv.igstAmount : inv.cgstAmount + inv.sgstAmount).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* amount paid strip — green check, right-aligned */}
        {inv.amountPaid > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: px(7),
              borderTop: "1px solid #222",
              padding: `${px(3)}px ${px(8)}px`,
              fontWeight: 600,
              fontSize: px(15),
            }}
          >
            <svg width={px(18)} height={px(18)} viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="12" fill={GREEN} />
              <path d="M6.5 12.5l3.6 3.6 7.4-7.6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Amount Paid
          </div>
        )}

        {/* bank | UPI | signature band */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "50.65% 16.09% 1fr",
            borderTop: "1px solid #222",
            minHeight: px(243),
          }}
        >
          <div style={{ padding: px(10), borderRight: "1px solid #222" }}>
            <div style={{ fontWeight: 600, fontSize: px(14) }}>Bank Details:</div>
            {bank ? (
              <div style={{ marginTop: px(9), lineHeight: `${px(21)}px`, fontSize: px(14) }}>
                <BankRow label="Bank:" val={bank.name} />
                <BankRow label="Account #:" val={bank.account} mono />
                <BankRow label="IFSC:" val={bank.ifsc} mono />
                <BankRow label="Branch:" val={bank.branch} />
              </div>
            ) : (
              <div style={{ marginTop: px(9), fontSize: px(12), color: INK4 }}>{"\u2014"}</div>
            )}
          </div>

          {payBox ? (
            <div style={{ padding: `${px(10)}px 0 ${px(10)}px ${px(1)}px`, borderRight: "1px solid #222" }}>
              <div style={{ fontWeight: 600, fontSize: px(13.5) }}>Pay using UPI:</div>
              {company?.qrImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={company.qrImageUrl}
                  alt="Payment QR code"
                  style={{ display: "block", width: px(122), height: px(122), marginTop: px(6), objectFit: "contain" }}
                />
              ) : upiQr ? (
                <div
                  style={{ width: px(122), height: px(122), marginTop: px(6) }}
                  dangerouslySetInnerHTML={{ __html: upiQr }}
                  aria-label="UPI payment QR code"
                />
              ) : null}
            </div>
          ) : (
            <div style={{ borderRight: "1px solid #222" }} />
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              alignItems: "stretch",
              padding: `${px(6)}px ${px(8)}px ${px(8)}px`,
              fontSize: px(12.5),
              color: INK4,
            }}
          >
            <div style={{ textAlign: "right" }}>For {sellerName.toUpperCase()}</div>
            {company?.signatureUrl && showSignature ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={company.signatureUrl}
                alt="Authorised signature"
                style={{
                  display: "block",
                  alignSelf: "center",
                  height: px(156),
                  maxWidth: px(156),
                  marginTop: px(4),
                  objectFit: "contain",
                  transform: "rotate(-4deg)",
                }}
              />
            ) : (
              <div style={{ height: px(156), marginTop: px(4) }} />
            )}
            <div style={{ textAlign: "right" }}>Authorized Signatory</div>
          </div>
        </div>

        {/* notes | terms band */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "49.8% 1fr",
            borderTop: "1px solid #222",
            fontSize: px(14),
            lineHeight: `${px(17.5)}px`,
          }}
        >
          <div style={{ padding: `${px(10)}px ${px(10)}px ${px(12)}px`, borderRight: "1px solid #222" }}>
            <div style={{ fontWeight: 600, marginBottom: px(5) }}>Notes:</div>
            {company?.invoiceFooter || "Thank you for the Business"}
          </div>
          <div style={{ padding: `${px(10)}px ${px(10)}px ${px(12)}px` }}>
            <div style={{ fontWeight: 600, marginBottom: px(5) }}>Terms and Conditions:</div>
            1. Goods once sold cannot be taken back or exchanged.
            <br />
            2. We are not the manufacturers, company will stand for warranty as per their terms and conditions.
            <br />
            3. Interest @24% p.a. will be charged for uncleared bills beyond 15 days.
            <br />
            4. Subject to local Jurisdiction.
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: px(66),
          fontSize: px(13.5),
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
        }}
      >
        <span>Page 1 / 1 · {copyLabel}</span>
        <span style={{ marginLeft: px(14) }}>This is a digitally signed document.</span>
        {inv.status === "void" && (
          <span style={{ marginLeft: px(14), fontWeight: 700, color: "#dc2626", textTransform: "uppercase" }}>
            Void {"\u2014"} not a valid document
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex" }}>
          <div
            style={{ width: 44, height: 44, flex: "none" }}
            dangerouslySetInnerHTML={{ __html: docQr }}
            aria-label="Document QR code"
          />
        </span>
      </div>
    </div>
  );

  return (
    <>
      {renderSheet("ORIGINAL FOR RECIPIENT")}
      <div
        className="invoice-office-copy"
        aria-hidden
      >
        {renderSheet("OFFICE COPY")}
      </div>

      {/* Copy handling + pagination. Screen (both the standalone /print page
          and the app's embedded preview): only the recipient copy is shown.
          Print (whichever print button was used): the office copy becomes
          visible and starts on its own sheet after the recipient copy — the
          print window yields ORIGINAL FOR RECIPIENT followed by OFFICE COPY.

          This <style> block travels with the fetched markup into the app's
          PrintPreviewPanel mount, so the same rules govern both flows.

          No extra blank pages: the sheet's min-height is 296mm (not 297mm) so
          fractional-px rounding at print DPI never spills an empty trailing
          page, and the office copy starts via an explicit page break instead
          of stacking right below the first sheet. */}
      <style>{`
        .invoice-office-copy { display: none !important; }
        @media print {
          .invoice-office-copy {
            display: block !important;
            break-before: page;
            page-break-before: always; /* legacy alias for older engines */
          }
        }
      `}</style>
    </>
  );
}

/* ---------- table cell styles ---------- */

function thS(numeric: boolean, bordered = true): React.CSSProperties {
  return {
    fontSize: px(12),
    fontWeight: 500,
    padding: `${px(5)}px ${px(6)}px`,
    textAlign: numeric ? "right" : "left",
    borderLeft: bordered ? `1px solid ${BORDER}` : undefined,
    borderBottom: "1px solid #222",
    background: "#fff",
  };
}

function tdS(numeric: boolean, bordered = true): React.CSSProperties {
  return {
    fontSize: px(13.5),
    padding: `${px(6)}px`,
    textAlign: numeric ? "right" : "left",
    verticalAlign: "top",
    borderLeft: bordered ? `1px solid ${BORDER}` : undefined,
    lineHeight: `${px(18)}px`,
  };
}

function hsnTh(align: "left" | "right" | "center", bordered = true): React.CSSProperties {
  return {
    fontSize: px(13.5),
    padding: `${px(2)}px ${px(8)}px`,
    borderLeft: bordered ? `1px solid ${BORDER}` : undefined,
    borderBottom: `1px solid ${BORDER}`,
    fontWeight: 400,
    textAlign: align as React.CSSProperties["textAlign"],
  };
}

function hsnTd(align: "left" | "right" | "center", bold = false): React.CSSProperties {
  return {
    fontSize: px(13.5),
    padding: `${px(2)}px ${px(8)}px`,
    borderLeft: `1px solid ${BORDER}`,
    borderBottom: `1px solid ${BORDER}`,
    fontWeight: bold ? 700 : 500,
    textAlign: align as React.CSSProperties["textAlign"],
  };
}

/* totals: first row unruled (the table's 2px rule sits above it), later rows
 * carry the full-width rule on every cell — matching the reference. */
const rule = "1px solid #222";
const totFirst: React.CSSProperties = { padding: `${px(3)}px ${px(8)}px`, fontSize: px(12.5) };
const totLabelFirst: React.CSSProperties = {
  padding: `${px(3)}px ${px(8)}px`,
  fontSize: px(13.5),
  fontWeight: 600,
  textAlign: "right",
  paddingRight: px(6),
};
const totValFirst: React.CSSProperties = {
  padding: `${px(3)}px ${px(8)}px`,
  fontSize: px(14),
  fontWeight: 600,
  textAlign: "right",
};
const totBorderedPlain: React.CSSProperties = { borderTop: rule };
const totGrandLabel: React.CSSProperties = {
  padding: `${px(2)}px ${px(8)}px`,
  fontSize: px(20),
  fontWeight: 600,
  textAlign: "right",
  paddingRight: px(6),
  borderTop: rule,
};
const totGrandVal: React.CSSProperties = {
  padding: `${px(2)}px ${px(8)}px`,
  fontSize: px(21),
  fontWeight: 700,
  textAlign: "right",
  borderTop: rule,
};

function TotRow({ label, val }: { label: string; val: string }) {
  return (
    <tr>
      <td style={totBorderedPlain} />
      <td style={{ ...totLabelFirst, borderTop: rule }}>{label}</td>
      <td style={{ ...totValFirst, borderTop: rule }}>{val}</td>
    </tr>
  );
}

function MetaCell({
  label,
  value,
  strong,
  divider,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        height: px(58),
        padding: `${px(10)}px ${px(8)}px`,
        borderBottom: "1px solid #222",
        fontSize: px(13.5),
        borderRight: divider ? "1px solid #222" : undefined,
      }}
    >
      <div style={{ fontWeight: 600, color: INK2 }}>{label}</div>
      <div style={{ marginTop: px(7), fontWeight: strong ? 700 : 400 }}>{value}</div>
    </div>
  );
}

function BankRow({ label, val, mono }: { label: string; val: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex" }}>
      <span style={{ width: px(112), color: "#444" }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: mono ? MONO : undefined }}>{val}</span>
    </div>
  );
}

/* ---------- helpers ---------- */

interface HsnGroup {
  hsn: string | null;
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

function groupByHsn(lines: InvoiceLine[]): HsnGroup[] {
  const map = new Map<string, HsnGroup>();
  for (const l of lines) {
    const rate = Number(l.gst_rate) || 0;
    const key = `${l.hsnCode ?? "\u2014"}|${rate}`;
    const g = map.get(key) ?? { hsn: l.hsnCode, rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.taxable += l.taxable_amount;
    g.cgst += l.cgst_amount;
    g.sgst += l.sgst_amount;
    g.igst += l.igst_amount;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => (a.hsn ?? "").localeCompare(b.hsn ?? "") || a.rate - b.rate);
}

function fmtQty3(value: number): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);
}

function inrWordsExact(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "";
  const whole = Math.floor(n);
  const paise = Math.round((n - whole) * 100);
  const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number): string =>
    x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? `-${ONES[x % 10]}` : ""}`;
  const three = (x: number): string => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    if (!h) return two(r);
    return `${ONES[h]} Hundred${r ? ` And ${two(r)}` : ""}`;
  };
  const crore = Math.floor(whole / 1e7);
  const rest7 = whole % 1e7; // lakh-and-below tail; `two(crore)` would cap at 99
  const lakh = Math.floor(rest7 / 1e5);
  const thousand = Math.floor((rest7 % 1e5) / 1e3);
  const rest = rest7 % 1e3;
  const parts: string[] = [];
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  if (!parts.length) return `INR ${paise ? `${two(paise)} Paise` : "Zero Rupees"} Only.`;
  let out = `INR ${parts.join(", ")} Rupees`;
  if (paise) out += ` And ${two(paise)} Paise`;
  return `${out} Only.`;
}

function addDays(dateIso: string, days: number): string | null {
  if (!days || days <= 0) return null;
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
