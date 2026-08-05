import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupplier } from "@/lib/data/suppliers";
import { listStockableItems } from "@/lib/data/stock";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { SupplierAvlPanel } from "./SupplierAvlPanel";
import { SupplierOpeningBalance } from "./SupplierOpeningBalance";
import { DocumentAttachPanel } from "@/components/documents/DocumentAttachPanel";
import { SUPPLIER_KINDS } from "@/lib/constants";

const KIND_LABEL: Record<string, string> = Object.fromEntries(SUPPLIER_KINDS.map((k) => [k.value, k.label]));

// Supplier detail (§5.3) — identity, the live payable, the Approved Vendor List
// (item prices/terms with one preferred), and the opening-balance seed.
export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  const [supplier, items] = await Promise.all([getSupplier(params.id), listStockableItems()]);
  if (!supplier) notFound();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/suppliers" className="text-[12px] font-medium text-ink-4 hover:text-brand">
            ← Suppliers
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-[22px] font-bold tracking-tight text-ink">{supplier.name}</h1>
            <span className="font-mono text-[13px] text-ink-4">{supplier.code}</span>
            <StatusBadge status={supplier.status} />
            <Badge tone="slate" size="sm">{KIND_LABEL[supplier.kind] ?? supplier.kind}</Badge>
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            State {supplier.stateCode}
            {supplier.gstin ? ` · ${supplier.gstin}` : " · Unregistered"}
            {supplier.city ? ` · ${supplier.city}` : ""}
          </p>
        </div>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Outstanding payable" value={<Money value={supplier.outstanding} />} mono
          tone={supplier.outstanding > 0 ? "amb" : "grn"} />
        <Fact label="Credit days" value={String(supplier.creditDays)} />
        <Fact label="Terms" value={supplier.paymentTerms ?? "—"} />
        <Fact label="Phone" value={supplier.phone ?? "—"} />
      </div>

      {/* AVL — client island */}
      <SupplierAvlPanel supplierId={supplier.id} avl={supplier.avl} items={items} />

      {/* Opening balance */}
      <SupplierOpeningBalance supplierId={supplier.id} hasOutstanding={supplier.outstanding > 0} />

      {/* Documents */}
      <DocumentAttachPanel entityType="supplier" entityId={supplier.id} entityLabel={supplier.code} />

      {(supplier.addressLine || supplier.email) && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Contact</div>
          <p className="mt-1 text-[13px] text-ink-2">
            {[supplier.addressLine, supplier.city, supplier.pincode].filter(Boolean).join(", ") || "—"}
            {supplier.email ? ` · ${supplier.email}` : ""}
          </p>
        </Card>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  tone?: "amb" | "grn";
}) {
  const toneClass = tone === "amb" ? "text-amb" : tone === "grn" ? "text-grn" : "text-ink";
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[15px] font-semibold " + toneClass + (mono ? " font-mono tnum" : "")}>
        {value}
      </div>
    </Card>
  );
}
