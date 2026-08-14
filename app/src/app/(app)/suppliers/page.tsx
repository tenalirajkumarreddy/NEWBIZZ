import Link from "next/link";
import { listSuppliers } from "@/lib/data/suppliers";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount } from "@/lib/format";
import { SuppliersTable } from "./SuppliersTable";

// Suppliers — the buy-side party master (§5.3). AP (2110) is keyed by
// party=supplier; the AVL (per-supplier item prices) lives on each detail page.
export const metadata = { title: "Suppliers — NEWBIZZ" };
export default async function SuppliersPage() {
  const suppliers = await listSuppliers();

  const active = suppliers.filter((s) => s.status === "active").length;
  const registered = suppliers.filter((s) => !!s.gstin).length;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Suppliers"
        subtitle={`${fmtCount(suppliers.length)} suppliers`}
        actions={
          <Link href="/suppliers/new">
            <Button variant="primary" size="sm">New supplier</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Suppliers" value={fmtCount(suppliers.length)} sub="All parties" />
        <Kpi label="Active" value={fmtCount(active)} sub="Available to purchase from" tone={active > 0 ? "grn" : undefined} />
        <Kpi label="GST-registered" value={fmtCount(registered)} sub="Carry a GSTIN" />
      </div>

      <Panel flush>
        {suppliers.length === 0 ? (
          <EmptyState
            title="No suppliers yet"
            description="Add a supplier to start raising purchase orders, receiving goods, and recording bills."
            action={
              <Link href="/suppliers/new">
                <Button variant="secondary" size="sm">Add a supplier</Button>
              </Link>
            }
          />
        ) : (
          <SuppliersTable suppliers={suppliers} />
        )}
      </Panel>
    </PageContainer>
  );
}
