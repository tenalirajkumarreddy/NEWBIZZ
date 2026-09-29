import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { verifyPrintToken } from "@/lib/print-token";
import { createServiceClient } from "@/lib/supabase/service";
import { getChallan, type ChallanLine } from "@/lib/data/challans";
import { getCompany } from "@/lib/data/settings";
import { qty as fmtQty } from "@/lib/format";
import { PrintDoc, PrintPanel, PrintMetaGrid, INK, INK2, INK3, INK4, LINE, WASH, MONO } from "../../print-doc";

export const dynamic = "force-dynamic";

// Printable delivery challan on the shared A4 design system (print-doc): the
// physical-fulfilment note handed to the carrier. Quantities only — never
// prices (no money moves on a challan). Sheet carries the standard document
// QR footer (newbizz://d/chl/{id}) so scanning the paper opens it in the APK.
export default async function PrintChallanPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { sign?: string; t?: string };
}) {
  // Session + challan.view, or a valid share token for THIS challan (APK
  // "Open full document" — no web session in the in-app browser).
  const session = await getSession();
  const token = verifyPrintToken(searchParams.t, "challan", params.id);
  if (!session && !token) redirect("/login");
  if (session && !token && !can(session.claims, "challan.view")) notFound();

  // Token-authed reads bypass RLS deliberately — the share token IS the
  // authorization (HMAC-bound to this document, expiry-checked).
  const db = token ? createServiceClient() : undefined;
  const [challan, company] = await Promise.all([getChallan(params.id, db), getCompany()]);
  if (!challan) notFound();

  return (
    <PrintDoc
      kind="chl"
      id={challan.id}
      title="Delivery Challan"
      company={company}
      docNo={challan.challan_no}
      docDate={challan.printedAt}
      status={challan.status}
      footer={company?.invoiceFooter}
      legalLines={
        <>
          Goods on the attached list are moved for/with an approved sales order and remain the
          property of the company until delivered and invoiced. E-way bill, where applicable,
          accompanies the consignment.
        </>
      }
      signs={[
        { label: "Dispatched by", hint: "Name / signature" },
        { label: "Received by", hint: "Name / signature" },
      ]}
      signatureUrl={searchParams.sign === "0" ? null : (company?.signatureUrl ?? null)}
    >
      {/* Parties + transport meta */}
      <PrintMetaGrid
        items={[
          { label: "Order", value: challan.orderNo ?? "—", mono: true },
          { label: "Customer", value: challan.customerName ?? "—" },
          { label: "Store", value: challan.storeName ?? "—", mono: false },
          { label: "Store code", value: challan.storeCode ?? "—", mono: true },
          { label: "Carried by", value: challan.agentName ?? "—" },
          { label: "E-way bill", value: challan.ewayBillNo ?? "—", mono: true },
        ]}
      />

      {/* Lines: quantities only — no money on a challan */}
      <PrintPanel title="Consignment items">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: WASH }}>
              <Th style={{ width: 28 }}>Sr</Th>
              <Th>Item</Th>
              <Th style={{ width: 78 }}>SKU</Th>
              <Th style={{ width: 70 }} numeric>Qty</Th>
            </tr>
          </thead>
          <tbody>
            {challan.lines.map((l) => (
              <LineRow key={l.id} line={l} />
            ))}
            <tr>
              <Td colSpan={3} style={{ textAlign: "right", fontWeight: 700, borderTop: `2px solid ${INK}` }}>
                Total units
              </Td>
              <Td numeric style={{ fontWeight: 700, borderTop: `2px solid ${INK}` }}>
                {fmtQty(challan.totalQty)}
              </Td>
            </tr>
          </tbody>
        </table>
      </PrintPanel>

      {challan.notes ? (
        <PrintPanel title="Notes">
          <div style={{ padding: "8px 10px", fontSize: 11, color: INK2, whiteSpace: "pre-line" }}>
            {challan.notes}
          </div>
        </PrintPanel>
      ) : null}
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
        color: INK3,
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

function LineRow({ line }: { line: ChallanLine }) {
  return (
    <tr>
      <Td>{line.line_no}</Td>
      <Td>
        <span style={{ fontWeight: 600, color: INK }}>{line.itemName ?? "—"}</span>
      </Td>
      <Td>{line.sku ?? "—"}</Td>
      <Td numeric>{fmtQty(line.qty)}</Td>
    </tr>
  );
}
