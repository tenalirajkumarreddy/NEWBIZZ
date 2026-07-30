"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Input, Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { ViewToggle } from "@/components/ui/ViewToggle";
import type { ViewMode } from "@/components/ui/ViewToggle";
import { count as fmtCount, titleCase } from "@/lib/format";
import type { CustomerListRow } from "@/lib/data/customers";

const KINDS = ["retail", "wholesale", "distributor", "institution"] as const;

export function CustomersTable({ customers }: { customers: CustomerListRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [view, setView] = useState<ViewMode>("cards");

  const query = sp.get("q") ?? "";
  const kind = sp.get("kind") ?? "";
  const status = sp.get("status") ?? "";
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const pushParams = useCallback(
    (params: URLSearchParams) => {
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname],
  );

  const flushParams = useCallback(
    (form: HTMLFormElement) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const fd = new FormData(form);
      const p = new URLSearchParams();
      for (const [k, v] of fd) if (v) p.set(k, v.toString());
      pushParams(p);
    },
    [pushParams],
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
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => flushParams(e.currentTarget), 300);
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
        <div className="flex items-center gap-2 sm:ml-auto">
          {(query || kind || status) && (
            <span className="text-[12px] text-ink-4">
              {fmtCount(filtered.length)} of {fmtCount(customers.length)} customers
            </span>
          )}
          <ViewToggle value={view} onChange={setView} />
        </div>
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching customers"
          description="No customers match the current search and filters — clear them to see everyone."
        />
      ) : view === "table" ? (
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
      ) : (
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="group block overflow-hidden rounded-lg border border-line bg-surface transition hover:border-ink-2 hover:shadow-sm active:scale-[0.99]"
            >
              <div className="aspect-[2/1] w-full overflow-hidden bg-fill">
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-[28px] font-bold text-ink-3">
                      {c.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                    </span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-ink group-hover:text-brand">{c.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-brand">{c.code}</div>
                  </div>
                  <Badge tone={c.status === "active" ? "grn" : "slate"} size="sm">{c.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <span className="text-ink-4">GSTIN</span>
                    <div className="font-mono text-ink">{c.gstin ?? "—"}</div>
                  </div>
                  <div>
                    <span className="text-ink-4">Phone</span>
                    <div className="text-ink">{c.phone ?? "—"}</div>
                  </div>
                  <div>
                    <span className="text-ink-4">Outstanding</span>
                    <div className="font-mono font-semibold text-amb tnum">
                      {c.outstanding > 0 ? <Money value={c.outstanding} /> : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-ink-4">Credit limit</span>
                    <div className="font-mono tnum">{c.creditLimit > 0 ? <Money value={c.creditLimit} /> : "Cash only"}</div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-ink-4">{fmtCount(c.storeCount)} store{c.storeCount !== 1 ? "s" : ""}</div>
              </div>
            </Link>
          ))}
        </div>
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
