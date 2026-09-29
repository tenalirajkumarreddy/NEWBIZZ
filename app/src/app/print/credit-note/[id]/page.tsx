import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { verifyPrintToken } from "@/lib/print-token";
import { createServiceClient } from "@/lib/supabase/service";
import { getCreditNote } from "@/lib/data/creditnotes";
import { getCompany } from "@/lib/data/settings";
import { amountInWords, dateIST, money, titleCase } from "@/lib/format";
import { PrintDoc, PrintPanel, PrintMetaGrid, INK, INK2, INK4, LINE, WASH, MONO } from "../../print-doc";

export const dynamic = "force-dynamic";

// Printable credit note on the shared A4 design system (print-doc): the sales
// return document that reverses value against a referenced invoice. Carries
// the standard document QR footer (newbizz://d/cn/{id}).
export default async function PrintCreditNotePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { sign?: string; t?: string };
}) {
  // Session + creditnote.view, or a valid share token for THIS credit note
  // (APK "Open full document" — no web session in the in-app browser).
  const session = await getSession();
  const token = verifyPrintToken(searchParams.t, "credit-note", params.id);
  if (!session && !token) redirect("/login");
  if (session && !token && !can(session.claims, "creditnote.view")) notFound();

  // Token-authed reads bypass RLS deliberately — the share token IS the
  // authorization (HMAC-bound to this document, expiry-checked).
  const db = token ? createServiceClient() : undefined;
  const [cn, company] = await Promise.all([getCreditNote(params.id, db), getCompany()]);
  if (!cn) notFound();

  // A credit note with returned lines is a sales return; other reasons are
  // value-only adjustments (rebate/complaint/adjustment).
  const isReturn = cn.returnLines.length > 0;

  return (
    <PrintDoc
      kind="cn"
      id={cn.id}
      title={isReturn ? "Credit Note — Sales Return" : "Credit Note"}
      company={company}
      docNo={cn.credit_note_no}
      docDate={cn.createdAt}
      status={cn.status}
      footer={company?.invoiceFooter}
      total={cn.amount}
      amountInWordsText={amountInWords(cn.amount) || undefined}
      signatureUrl={searchParams.sign === "0" ? null : (company?.signatureUrl ?? null)}
      legalLines={
        <>
          This credit note adjusts value against invoice{" "}
          <span style={{ fontFamily: MONO, fontWeight: 700, color: INK2 }}>{cn.referenceInvoiceNo ?? "—"}</span>
          .{" "}
          {isReturn
            ? "Returned goods have been received back and stock restored; tax adjustment follows the referenced invoice's rates."
            : "Value adjustment issued without goods movement."}{" "}
          Input tax credit, where claimed by the recipient, is to be reversed in respect of this document.
        </>
      }
    >
      {/* Parties + reason meta */}
      <PrintMetaGrid
        items={[
          { label: "Customer", value: cn.customerName ?? "—" },
          { label: "Store", value: cn.storeName ?? "—" },
          { label: "Reason", value: titleCase(cn.reason) },
          { label: "Reference invoice", value: cn.referenceInvoiceNo ?? "—", mono: true },
          { label: "Dated", value: dateIST(cn.createdAt), mono: true },
          { label: "Status", value: titleCase(cn.status) },
        ]}
      />

      {/* Return lines */}
      <PrintPanel title={isReturn ? "Returned items" : "Adjustment summary"}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: WASH }}>
              <Th style={{ width: 28 }}>Sr</Th>
              <Th>Item</Th>
              <Th style={{ width: 78 }}>SKU</Th>
              <Th style={{ width: 64 }} numeric>Qty</Th>
              <Th style={{ width: 86 }} numeric>Taxable</Th>
              <Th style={{ width: 80 }} numeric>Tax</Th>
            </tr>
          </thead>
          <tbody>
            {cn.returnLines.map((l) => (
              <tr key={l.id}>
                <Td>{l.line_no}</Td>
                <Td>
                  <span style={{ fontWeight: 600, color: INK }}>{l.itemName ?? "—"}</span>
                  {l.sku ? <span style={{ marginLeft: 6, fontSize: 10, color: INK4, fontFamily: MONO }}>{l.sku}</span> : null}
                </Td>
                <Td>{l.sku ?? "—"}</Td>
                <Td numeric>{l.qty}</Td>
                <Td numeric>{money(l.taxableAmount)}</Td>
                <Td numeric>{money(l.taxAmount)}</Td>
              </tr>
            ))}
            <tr>
              <Td colSpan={4} style={{ textAlign: "right", fontWeight: 700, borderTop: `2px solid ${INK}` }}>
                Totals
              </Td>
              <Td numeric style={{ fontWeight: 700, borderTop: `2px solid ${INK}` }}>
                {money(cn.baseAmount)}
              </Td>
              <Td numeric style={{ fontWeight: 700, borderTop: `2px solid ${INK}` }}>
                {money(cn.taxAmount)}
              </Td>
            </tr>
          </tbody>
        </table>
      </PrintPanel>

      {/* Amount + narration */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <PrintPanel title="We credit">
          <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: INK4 }}>
              Total credit
            </span>
            <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 16, fontWeight: 700, color: INK }}>
              {money(cn.amount)}
            </span>
          </div>
        </PrintPanel>
        {cn.narration ? (
          <PrintPanel title="Narration">
            <div style={{ padding: "8px 12px", fontSize: 11, color: INK2, whiteSpace: "pre-line" }}>{cn.narration}</div>
          </PrintPanel>
        ) : null}
      </div>
    </PrintDoc>
  );
}

function Th({ children, style, numeric }: { children: React.ReactNode; style?: React.CSSProperties; numeric?: boolean }) {
  return (
    <th
      style={{
        padding: "5px 10px",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.8px",
        textTransform: "uppercase",
        color: INK4,
        borderBottom: `1px solid ${LINE}`,
        textAlign: numeric ? "right" : "left",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
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
        padding: "5px 10px",
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
