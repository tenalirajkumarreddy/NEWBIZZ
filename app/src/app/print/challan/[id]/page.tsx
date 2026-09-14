import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { getChallan, type ChallanLine } from "@/lib/data/challans";
import { getCompany } from "@/lib/data/settings";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, dateTimeIST, qty as fmtQty, titleCase } from "@/lib/format";
import { PrintButton } from "../../PrintButton";

export const dynamic = "force-dynamic";

// Printable delivery challan (§4.4): the physical-fulfilment note handed to
// the carrier. Quantities only — never prices (no money moves on a challan).
// Lives outside the (app) group so the shell chrome can't leak onto paper;
// middleware still login-gates it and getChallan is RLS-scoped (null → 404).
// Belt over middleware: redirect signed-out sessions to /login here too.
export default async function PrintChallanPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [challan, company] = await Promise.all([getChallan(params.id), getCompany()]);
  if (!challan) notFound();

  const generatedAt = new Date().toISOString();

  return (
    <div className="challan-print mx-auto flex w-full max-w-[794px] flex-col gap-5 px-6 py-8">
      {/* Screen-only toolbar */}
      <div className="sticky top-0 z-10 -mx-6 flex justify-end bg-white/95 px-6 py-2 backdrop-blur print:hidden">
        <PrintButton />
      </div>

      {/* Business identity — mirrors ReceiptSheet's letterhead block */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold tracking-tight text-ink">
            {company?.legalName ?? "NEWBIZZ"}
          </h1>
          {company?.address && (
            <p className="mt-0.5 text-[12px] text-ink-3">{company.address}</p>
          )}
          {company?.primaryGstin && (
            <p className="mt-0.5 font-mono text-[11px] text-ink-3">
              GSTIN {company.primaryGstin}
              {company.stateCode ? ` · State ${company.stateCode}` : ""}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-4">
            Delivery Challan
          </p>
          <p className="mt-0.5 font-mono text-[15px] font-semibold text-ink">
            {challan.challan_no}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-3">Printed {dateIST(challan.printedAt)}</p>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Meta label="Order" value={challan.orderNo ?? "—"} mono />
        <Meta label="Customer" value={challan.customerName ?? "—"} />
        <Meta
          label="Store"
          value={challan.storeName ?? "—"}
          sub={challan.storeCode ?? undefined}
        />
        <Meta label="Carried by" value={challan.agentName ?? "—"} />
        <Meta label="E-way bill" value={challan.ewayBillNo ?? "—"} mono />
        <Meta label="Status" value={titleCase(challan.status)} />
      </div>

      {/* Lines: quantities only — no money on a challan */}
      <Table className="border-collapse">
        <THead>
          <TR>
            <TH className="w-10">Sr</TH>
            <TH>Item</TH>
            <TH className="w-32">SKU</TH>
            <TH numeric className="w-24">Qty</TH>
          </TR>
        </THead>
        <TBody>
          {challan.lines.map((l) => (
            <LineRow key={l.id} line={l} />
          ))}
          <TR>
            <TD colSpan={3} className="border-t-2 border-ink px-3 py-2.5 text-right text-[13px] font-semibold text-ink">
              Total units
            </TD>
            <TD numeric className="border-t-2 border-ink text-[13px] font-bold text-ink">
              {fmtQty(challan.totalQty)}
            </TD>
          </TR>
        </TBody>
      </Table>

      {challan.notes && (
        <div>
          <div className="eyebrow text-ink-4">Notes</div>
          <p className="mt-1 whitespace-pre-line text-[12px] text-ink-2">{challan.notes}</p>
        </div>
      )}

      {/* Signature blocks */}
      <div className="mt-8 grid grid-cols-2 gap-8">
        <Sign label="Dispatched by" />
        <Sign label="Received by" />
      </div>

      <p className="mt-6 border-t border-line pt-3 text-[10px] text-ink-4">
        This is a computer-generated document. Generated {dateTimeIST(generatedAt)} (IST).
      </p>
    </div>
  );
}

function Meta({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div>
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-0.5 text-[13px] font-semibold text-ink " + (mono ? "font-mono tnum" : "")}>
        {value}
      </div>
      {sub && <div className="font-mono text-[11px] text-ink-4">{sub}</div>}
    </div>
  );
}

function LineRow({ line }: { line: ChallanLine }) {
  return (
    <TR>
      <TD className="text-ink-4">{line.line_no}</TD>
      <TD>
        <span className="font-medium text-ink">{line.itemName ?? "—"}</span>
      </TD>
      <TD className="font-mono text-[11px] text-ink-3">{line.sku ?? "—"}</TD>
      <TD numeric>{fmtQty(line.qty)}</TD>
    </TR>
  );
}

function Sign({ label }: { label: string }) {
  return (
    <div className="flex h-24 flex-col justify-end">
      <div className="border-b border-ink" />
      <div className="mt-1 text-[11px] font-semibold text-ink-2">{label}</div>
      <div className="mt-0.5 text-[10px] text-ink-4">Date: __________________</div>
    </div>
  );
}
