"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Table, THead, TBody, TR, TH, TD, EmptyState, Kpi, Select, Input } from "@/components/ui";
import { AUDIT_ACTION_LABELS, type AuditAction, type AuditRow } from "@/lib/data/audit";

interface Props {
  initialRows: AuditRow[];
  entities: string[];
  actions: AuditAction[];
}

const ACTION_TONE: Record<AuditAction, "neutral" | "slate" | "brand" | "grn" | "amb" | "red"> = {
  insert: "slate",
  update: "slate",
  delete: "red",
  approve: "grn",
  reject: "red",
  post: "brand",
  void: "amb",
  login: "neutral",
};

const ENTITY_LABELS: Record<string, string> = {
  journal_entries: "Journal",
  invoices: "Invoice",
  sales_orders: "Sales Order",
  customer_receipts: "Receipt",
  credit_notes: "Credit Note",
  purchase_orders: "Purchase Order",
  purchase_receipts: "Purchase Receipt",
  supplier_bills: "Supplier Bill",
  supplier_payments: "Supplier Payment",
  debit_notes: "Debit Note",
  expenses: "Expense",
  fixed_assets: "Asset",
  loans: "Loan",
  transfers: "Transfer",
  production_runs: "Production Run",
  costing_runs: "Costing Run",
  boms: "BOM",
  cheque_registry: "Cheque",
  bank_statement_imports: "Bank Import",
  bank_transactions: "Bank Txn",
  reconciliation_adjustments: "Recon Adjustment",
  commission_runs: "Commission Run",
  payroll_runs: "Payroll",
  gstr2b_imports: "GSTR2B Import",
  users: "User",
  user_roles: "User Role",
  roles: "Role",
  role_permissions: "Role Permission",
  user_permission_overrides: "Permission Override",
  customers: "Customer",
  schemes: "Scheme",
  fuel_logs: "Fuel Log",
  licenses: "Licence",
};

export function AuditLogPage({ initialRows, entities, actions }: Props) {
  const [rows, setRows] = useState<AuditRow[]>(initialRows);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string>("");
  const [entity, setEntity] = useState<string>("");
  const [q, setQ] = useState("");
  const lastId = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);

  useEffect(() => {
    if (initialRows.length > 0) lastId.current = initialRows[initialRows.length - 1].id;
    else lastId.current = undefined;
    setHasMore(initialRows.length >= 50);
  }, [initialRows]);

  const applyFilters = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (entity) params.set("entity", entity);
      if (q) params.set("q", q);
      const res = await fetch(`/admin/audit/data?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setRows(data.rows);
      lastId.current = data.rows.length > 0 ? data.rows[data.rows.length - 1].id : undefined;
      setHasMore(data.hasMore);
    } catch {
      // keep current rows
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [action, entity, q]);

  const loadMore = useCallback(async () => {
    if (inFlight.current || !hasMore || lastId.current === undefined) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (entity) params.set("entity", entity);
      if (q) params.set("q", q);
      if (lastId.current !== undefined) params.set("before", String(lastId.current));
      const res = await fetch(`/admin/audit/data?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setRows((prev) => [...prev, ...data.rows]);
      lastId.current = data.rows.length > 0 ? data.rows[data.rows.length - 1].id : undefined;
      setHasMore(data.hasMore);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [action, entity, q, hasMore]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Showing" value={rows.length} sub="of last fetched page" />
        <Kpi label="Posts" value={count(rows, "post")} tone="grn" />
        <Kpi label="Approvals" value={count(rows, "approve")} tone="grn" />
        <Kpi label="Voids / deletes" value={count(rows, "void") + count(rows, "delete")} tone={count(rows, "void") + count(rows, "delete") > 0 ? "amb" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="w-36"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</option>
          ))}
        </Select>
        <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="w-44">
          <option value="">All entities</option>
          {entities.map((e) => (
            <option key={e} value={e}>{ENTITY_LABELS[e] ?? e}</option>
          ))}
        </Select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search summary…"
          className="w-64"
        />
        <Button variant="secondary" size="sm" onClick={applyFilters} disabled={loading}>
          {loading ? "Loading…" : "Filter"}
        </Button>
        {(action || entity || q) && (
          <Button variant="ghost" size="sm" onClick={() => { setAction(""); setEntity(""); setQ(""); }}>
            Clear
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Who</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>ID</TH>
              <TH>Summary</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && (
              <TR>
                <TD colSpan={6} className="px-0 py-0">
                  <EmptyState
                    title="No audit events found"
                    description="Adjust the filters, or run some activity — every mutation and approval in NEWBIZZ lands here."
                  />
                </TD>
              </TR>
            )}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap font-mono text-[12px] text-ink-3">{fmtTime(r.at)}</TD>
                <TD className="whitespace-nowrap text-[13px] text-ink">{r.actorName ?? "System"}</TD>
                <TD>
                  <Badge tone={ACTION_TONE[r.action]}>{AUDIT_ACTION_LABELS[r.action]}</Badge>
                </TD>
                <TD className="text-[13px] text-ink">{ENTITY_LABELS[r.entity] ?? r.entity}</TD>
                <TD className="font-mono text-[12px] text-ink-3">{r.entityId ?? "—"}</TD>
                <TD className="max-w-[380px] truncate text-[13px] text-ink-3" title={r.summary ?? ""}>
                  {r.summary ?? "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={loadMore} loading={loading}>
            Load older
          </Button>
        </div>
      )}
    </div>
  );
}

function count(rows: AuditRow[], a: AuditAction): number {
  return rows.filter((r) => r.action === a).length;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
