"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { count as fmtCount } from "@/lib/format";
import { SUPPLIER_KINDS } from "@/lib/constants";
import type { SupplierListRow } from "@/lib/data/suppliers";

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  SUPPLIER_KINDS.map((k) => [k.value, k.label]),
);

export function SuppliersTable({ suppliers }: { suppliers: SupplierListRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (kind && s.kind !== kind) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.gstin ?? "").toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q)
      );
    });
  }, [suppliers, query, kind]);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, code, GSTIN, city…"
          className="sm:max-w-[320px]"
        />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="sm:max-w-[180px]" aria-label="Filter by kind">
          <option value="">All kinds</option>
          {SUPPLIER_KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </Select>
        {(query || kind) && (
          <span className="text-[12px] text-ink-4 sm:ml-auto">
            {fmtCount(filtered.length)} of {fmtCount(suppliers.length)}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No matching suppliers" description="Clear the search and filter to see the full list." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Kind</TH>
              <TH>GSTIN</TH>
              <TH>State</TH>
              <TH>City</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((s) => (
              <TR key={s.id} interactive>
                <TD className="p-0">
                  <Link href={`/suppliers/${s.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">
                    {s.code}
                  </Link>
                </TD>
                <TD className="font-medium text-ink">{s.name}</TD>
                <TD><Badge tone="slate" size="sm">{KIND_LABEL[s.kind] ?? s.kind}</Badge></TD>
                <TD className="font-mono text-[11px] text-ink-3">{s.gstin ?? "—"}</TD>
                <TD className="font-mono text-[12px]">{s.stateCode}</TD>
                <TD>{s.city ?? "—"}</TD>
                <TD><StatusBadge status={s.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
