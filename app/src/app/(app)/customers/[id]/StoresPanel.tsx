"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { ViewToggle } from "@/components/ui/ViewToggle";
import type { ViewMode } from "@/components/ui/ViewToggle";
import { count as fmtCount, titleCase } from "@/lib/format";
import type { StoreListRow } from "@/lib/data/customers";

const KIND_TONE: Record<string, "brand" | "grn" | "amb" | "slate"> = {
  retail: "brand",
  wholesale: "grn",
  distributor: "amb",
  institution: "slate",
};

export function StoresPanel({
  customerId,
  stores,
}: {
  customerId: string;
  stores: StoreListRow[];
}) {
  const [view, setView] = useState<ViewMode>("cards");

  return (
    <Panel
      title={`Stores (${fmtCount(stores.length)})`}
      actions={
        <div className="flex items-center gap-2">
          {stores.length > 0 && <ViewToggle value={view} onChange={setView} />}
          <Link
            href={`/customers/${customerId}/stores/new`}
            className="text-[12px] font-medium text-brand hover:underline"
          >
            Add store
          </Link>
        </div>
      }
    >
      {stores.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-4">
          No stores yet —{" "}
          <Link href={`/customers/${customerId}/stores/new`} className="text-brand hover:underline">add the first one</Link>.
        </p>
      ) : view === "cards" ? (
        <div className="flex flex-col gap-2 p-3">
          {stores.map((s) => (
            <Link
              key={s.id}
              href={`/customers/${customerId}/stores/${s.id}`}
              className="group block rounded-lg border border-line bg-surface p-3.5 transition hover:border-ink-2 hover:shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-brand">{s.code}</span>
                    {s.isPrimary && <Badge tone="brand" size="sm">Primary</Badge>}
                  </div>
                  <div className="mt-0.5 text-[14px] font-medium text-ink">{s.name}</div>
                </div>
                <Badge tone={KIND_TONE[s.kind] ?? "slate"} size="sm">{titleCase(s.kind)}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
                {s.city && <span>{s.city}</span>}
                {s.phone && <span>{s.phone}</span>}
                {s.priceListName && <span>Rate: {s.priceListName}</span>}
              </div>
              <div className="mt-1.5">
                <Badge tone={s.status === "active" ? "grn" : "slate"} size="sm">{s.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Kind</TH>
              <TH>City</TH>
              <TH>Phone</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {stores.map((s) => (
              <TR key={s.id} interactive>
                <TD className="p-0">
                  <Link
                    href={`/customers/${customerId}/stores/${s.id}`}
                    className="flex items-center gap-2 px-3 py-2.5 font-mono text-[12px] font-semibold text-brand"
                  >
                    {s.code}
                    {s.isPrimary && <Badge tone="brand" size="sm">Primary</Badge>}
                  </Link>
                </TD>
                <TD className="p-0">
                  <Link
                    href={`/customers/${customerId}/stores/${s.id}`}
                    className="block px-3 py-2.5 font-medium text-ink hover:text-brand"
                  >
                    {s.name}
                  </Link>
                </TD>
                <TD><Badge tone={KIND_TONE[s.kind] ?? "slate"} size="sm">{titleCase(s.kind)}</Badge></TD>
                <TD>{s.city ?? "—"}</TD>
                <TD>{s.phone ?? "—"}</TD>
                <TD><Badge tone={s.status === "active" ? "grn" : "slate"} size="sm">{s.status}</Badge></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}
