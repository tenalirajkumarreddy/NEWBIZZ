import Image from "next/image";
import { docQrSvg } from "@/lib/qr";
import { dateIST, dateTimeIST, rupees, titleCase } from "@/lib/format";

/* ============================================================================
 * print-doc — the A4 document design system (universal document QR phase).
 *
 * Industrial-grade paper conventions, shared by every printed document so the
 * whole family looks like one company produced it:
 *   • A4 sheet: 210mm × 297mm, real mm geometry, sheet-boundary margins
 *     (14mm top/bottom, 12mm sides) + a sheet frame (hairline brand border).
 *   • Brand bar: 3px cyan rule along the top edge of every sheet.
 *   • Paper palette: near-black ink, blue-grey secondaries, hairline borders
 *     (see print/layout.tsx PAPER_TOKENS; styles here are inline so they
 *     print identically regardless of app theme).
 *   • One typographic system: sans headings, mono for every number.
 *   • Cyan accents only on brand elements (title, brand bar, QR frame).
 *   • Footer on every sheet: document QR + caption, legal line, generated-at.
 *
 * Usage (server components only — QR encoding is async):
 *   <PrintDoc kind="inv" id={inv.id} title="TAX INVOICE" company={company}
 *             docNo={inv.invoice_no} docDate={inv.invoice_date}
 *             status={inv.status} footer={company?.invoiceFooter}
 *             total={inv.grandTotal} amountInWordsText={words}>
 *     ...document-specific body...
 *   </PrintDoc>
 * ==========================================================================*/

export type PrintDocKind = "inv" | "chl" | "ord" | "cn";

/* ---------- geometry + palette ---------- */

const PAGE_W = 210; // mm
const PAGE_H = 297;
const MARGIN_X = 12; // sheet boundary spacing
const MARGIN_Y = 14;

const INK = "#0f172a";
const INK2 = "#334155";
const INK3 = "#475569";
const INK4 = "#64748b";
const LINE = "#dbe2ea";
const LINE_SOFT = "#eef2f6";
const WASH = "#f6f8fa";
const BRAND = "#0891b2";
const RED = "#dc2626";

const MONO = 'var(--font-mono, ui-monospace, "SF Mono", monospace)';

/* ---------- the sheet ---------- */

export interface PrintDocProps {
  kind: PrintDocKind;
  id: string;
  /** e.g. "TAX INVOICE" | "DELIVERY CHALLAN" | "CREDIT NOTE" */
  title: string;
  company: {
    legalName: string;
    tradeName: string | null;
    primaryGstin: string | null;
    pan: string | null;
    stateCode: string;
    address: string | null;
    fssaiNo: string | null;
    bisNo: string | null;
  } | null;
  docNo: string;
  docDate: string;
  status?: string | null;
  /** company_settings.invoice_footer */
  footer?: string | null;
  /** grand total — shown under the body as the sheet's money anchor */
  total?: number;
  /** pre-computed words text (from amountInWords) */
  amountInWordsText?: string;
  /** extra legal lines above the signature row (terms, bank details…) */
  legalLines?: React.ReactNode;
  /** named sign blocks */
  signs?: { label: string; hint?: string }[];
  children: React.ReactNode;
}

export async function PrintDoc({
  kind,
  id,
  title,
  company,
  docNo,
  docDate,
  status,
  footer,
  total,
  amountInWordsText,
  legalLines,
  signs = [{ label: "Authorised Signatory" }],
  children,
}: PrintDocProps) {
  const qr = await docQrSvg(kind, id, 96);

  return (
    <div
      style={{
        width: `${PAGE_W}mm`,
        minHeight: `${PAGE_H}mm`,
        background: "#ffffff",
        color: INK,
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        display: "flex",
        flexDirection: "column",
        padding: `${MARGIN_Y}mm ${MARGIN_X}mm`,
        boxSizing: "border-box",
        position: "relative",
        margin: "0 auto",
      }}
    >
      {/* sheet frame + brand bar */}
      <div aria-hidden style={{ position: "absolute", inset: "7mm", border: `1px solid ${LINE}`, pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", top: "7mm", left: "7mm", right: "7mm", height: 3, background: BRAND }} />

      {/* ================= letterhead ================= */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          paddingBottom: 10,
          borderBottom: `2px solid ${INK}`,
        }}
      >
        {/* identity */}
        <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
          <Image
            src="/brand/logo.png"
            alt=""
            width={56}
            height={56}
            style={{ objectFit: "contain", borderRadius: 10, background: WASH, padding: 4, flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 19, lineHeight: "23px", fontWeight: 700, letterSpacing: "-0.2px", color: INK }}>
              {company?.tradeName ?? company?.legalName ?? "NEWBIZZ"}
            </h1>
            {company?.address && (
              <p style={{ margin: "2px 0 0", fontSize: 11, lineHeight: "15px", color: INK3, whiteSpace: "pre-line" }}>
                {company.address}
              </p>
            )}
            <div style={{ marginTop: 3, fontSize: 10, color: INK3 }}>
              {company?.primaryGstin ? (
                <>
                  <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>GSTIN {company.primaryGstin}</span>
                  <span style={{ margin: "0 7px", color: INK4 }}>·</span>
                </>
              ) : null}
              {company?.pan ? (
                <>
                  <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>PAN {company.pan}</span>
                  <span style={{ margin: "0 7px", color: INK4 }}>·</span>
                </>
              ) : null}
              <span>State {company?.stateCode ?? "—"}</span>
            </div>
            {(company?.fssaiNo || company?.bisNo) && (
              <div style={{ marginTop: 1, fontSize: 9, color: INK4 }}>
                {company.fssaiNo ? (
                  <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>FSSAI {company.fssaiNo}</span>
                ) : null}
                {company.fssaiNo && company.bisNo ? <span style={{ margin: "0 7px" }}>·</span> : null}
                {company.bisNo ? (
                  <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>BIS {company.bisNo}</span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* document identity block */}
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.6px", textTransform: "uppercase", color: BRAND }}>
            {title}
          </div>
          <div style={{ marginTop: 3, fontSize: 15, fontWeight: 700, color: INK, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
            {docNo}
          </div>
          <div style={{ marginTop: 2, fontSize: 11, color: INK3 }}>Dated {dateIST(docDate)}</div>
          {status ? (
            <div style={{ marginTop: 2, fontSize: 10, fontWeight: 700, color: status === "void" ? RED : INK4 }}>
              {status === "void" ? "VOID — NOT A VALID DOCUMENT" : titleCase(status)}
            </div>
          ) : null}
        </div>
      </div>

      {/* ================= body ================= */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
        {children}
      </div>

      {/* ================= words + totals anchor ================= */}
      {amountInWordsText ? (
        <div style={{ marginTop: 10, fontSize: 11, color: INK2 }}>
          <span style={{ fontWeight: 700, color: INK }}>Amount in words: </span>
          <span style={{ fontStyle: "italic" }}>{amountInWordsText}</span>
        </div>
      ) : null}
      {total != null && total > 0 ? (
        <div style={{ marginTop: 4, fontSize: 11, color: INK4 }}>
          E.&amp;O.E. — Document total:{" "}
          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: INK }}>
            {rupees(total)}
          </span>
        </div>
      ) : null}

      {legalLines ? (
        <div style={{ marginTop: 8, fontSize: 10, color: INK3, lineHeight: "15px" }}>{legalLines}</div>
      ) : null}

      {/* signature row */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 28, marginTop: 16 }}>
        {signs.map((sg) => (
          <div key={sg.label} style={{ width: 190 }}>
            <div style={{ height: 38, borderBottom: `1px solid ${INK}` }} />
            <div style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: INK2 }}>{sg.label}</div>
            {sg.hint ? <div style={{ fontSize: 9, color: INK4 }}>{sg.hint}</div> : null}
            <div style={{ fontSize: 9, color: INK4 }}>Date: ______________</div>
          </div>
        ))}
      </div>

      {/* footer: document QR + caption | company footer | generated-at */}
      <div
        style={{
          marginTop: 12,
          borderTop: `1px solid ${LINE}`,
          paddingTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{ width: 72, height: 72, flexShrink: 0, padding: 4, border: `1px solid ${LINE_SOFT}`, borderRadius: 4 }}
          dangerouslySetInnerHTML={{ __html: qr }}
          aria-label="Document QR code"
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: INK4 }}>
            Scan to open
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: INK4 }}>
            Scan this QR with the NEWBIZZ app to open this document instantly.
          </p>
          {footer ? (
            <p style={{ margin: "4px 0 0", fontSize: 9, color: INK4, whiteSpace: "pre-line" }}>{footer}</p>
          ) : null}
        </div>
        <div style={{ textAlign: "right", fontSize: 9, color: INK4, flexShrink: 0 }}>
          <div>Generated {dateTimeIST(new Date().toISOString())} (IST)</div>
          <div style={{ marginTop: 2 }}>Page 1 of 1</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- framed panel + meta grid used inside bodies ---------- */

export function PrintPanel({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 2, overflow: "hidden", ...style }}>
      {title ? (
        <div
          style={{
            background: WASH,
            borderBottom: `1px solid ${LINE}`,
            padding: "5px 10px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: INK3,
          }}
        >
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function PrintMetaGrid({
  items,
}: {
  items: { label: string; value: React.ReactNode; mono?: boolean; span?: 2 | 3 }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        border: `1px solid ${LINE}`,
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {items.map((it, i) => (
        <div
          key={`${it.label}-${i}`}
          style={{
            padding: "8px 10px",
            borderRight: (i + 1) % 3 === 0 ? "none" : `1px solid ${LINE}`,
            borderBottom: `1px solid ${LINE}`,
            gridColumn: it.span ? `span ${it.span}` : undefined,
            background: "#ffffff",
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: INK4 }}>
            {it.label}
          </div>
          <div style={{ marginTop: 2, fontSize: 12, fontWeight: 600, color: INK2 }}>
            {it.mono ? (
              <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{it.value}</span>
            ) : (
              it.value
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export { INK, INK2, INK3, INK4, LINE, LINE_SOFT, WASH, BRAND, RED, MONO, PAGE_W, PAGE_H, MARGIN_X, MARGIN_Y };

/* ---------- shared table cells (boxed-format sheets) ---------- */

/** PrintTh — uppercase micro table header; per-cell borders are passed via
 *  style by the sheet (boxed formats draw their own grid). */
export function PrintTh({
  children,
  style,
  numeric,
  colSpan,
  rowSpan,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  numeric?: boolean;
  colSpan?: number;
  rowSpan?: number;
}) {
  return (
    <th
      colSpan={colSpan}
      rowSpan={rowSpan}
      style={{
        padding: "4px 8px",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.6px",
        textTransform: "uppercase",
        color: INK3,
        textAlign: numeric ? "right" : "left",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

/** PrintTd — data cell with hairline underline by default; boxed formats
 *  override borders via style. Numeric cells get the mono/tnum treatment. */
export function PrintTd({
  children,
  style,
  numeric,
  colSpan,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  numeric?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "4px 8px",
        borderBottom: `1px solid ${LINE}`,
        color: INK2,
        textAlign: numeric ? "right" : "left",
        fontFamily: numeric ? MONO : undefined,
        fontVariantNumeric: numeric ? "tabular-nums" : undefined,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
