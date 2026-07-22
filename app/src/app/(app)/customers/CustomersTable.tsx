"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Input, Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { count as fmtCount, titleCase } from "@/lib/format";
import type { CustomerListRow } from "@/lib/data/customers";

const KINDS = ["retail", "wholesale", "distributor", "institution"] as const;

export function CustomersTable({ customers }: { customers: CustomerListRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const query = sp.get("q") ?? "";
  const kind = sp.get("kind") ?? "";
  const status = sp.get("status") ?? "";

  const setParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(sp);
      if (value) p.set(key, value);
      else p.delete(key);
      router.replace(`${pathname}?${p.toString()}`);
    },
    [router, pathname, sp],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (kind && c.primaryStoreKind !== kind) return false;
      if (status && c.status !== status) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.gstin ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [customers, query, kind, status]);

  return (
    <>
      <form
        className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center"
        onChange={(e) => {
          const form = e.currentTarget;
          const fd = new FormData(form);
          const p = new URLSearchParams();
          for (const [k, v] of fd) if (v) p.set(k, v.toString());
          router.replace(`${pathname}?${p.toString()}`);
        }}
      >
        <Input
          name="q"
          defaultValue={query}
          placeholder="Search code, name, store name, GSTIN, phone…"
          className="sm:max-w-[360px]"
        />
        <Select
          name="kind"
          defaultValue={kind}
          className="sm:max-w-[160px]"
          aria-label="Filter by kind"
        >
          <option value="">All kinds</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>{titleCase(k)}</option>
          ))}
        </Select>
        <Select
          name="status"
          defaultValue={status}
          className="sm:max-w-[150px]"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
        <button type="submit" className="hidden" />
        {(query || kind || status) && (
          <span className="text-[12px] text-ink-4">
            {fmtCount(filtered.length)} of {fmtCount(customers.length)} customers
          </span>
        )}
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching customers"
          description="No customers match the current search and filters — clear them to see everyone."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>GSTIN</TH>
              <TH>Phone</TH>
              <TH numeric>Outstanding</TH>
              <TH numeric>Credit limit</TH>
              <TH numeric>Stores</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((c) => (
              <TR key={c.id} interactive>
                <TD className="p-0">
                  <Link
                    href={`/customers/${c.id}`}
                    className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand"
                  >
                    {c.code}
                  </Link>
                </TD>
                <TD className="p-0">
                  <Link
                    href={`/customers/${c.id}`}
                    className="flex items-center gap-2 px-3 py-2.5 font-medium text-ink hover:text-brand"
                  >
                    <Avatar url={c.imageUrl} name={c.name} />
                    {c.name}
                  </Link>
                </TD>
                <TD className="font-mono text-[12px]">{c.gstin ?? "—"}</TD>
                <TD>{c.phone ?? "—"}</TD>
                <TD numeric>
                  {c.outstanding > 0 ? (
                    <span className="font-mono font-semibold text-amb tnum"><Money value={c.outstanding} /></span>
                  ) : (
                    <span className="text-ink-4">—</span>
                  )}
                </TD>
                <TD numeric>
                  {c.creditLimit > 0 ? <Money value={c.creditLimit} /> : <span className="text-ink-4">Cash only</span>}
                </TD>
                <TD numeric>{fmtCount(c.storeCount)}</TD>
                <TD>
                  <Badge tone={c.status === "active" ? "grn" : "slate"} size="sm">
                    {c.status}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return <img src={url} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover ring-1 ring-inset ring-line" />;
  }
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-fill font-mono text-[10px] font-bold text-ink-4 ring-1 ring-inset ring-line">
      {initials || "—"}
    </span>
  );
}
