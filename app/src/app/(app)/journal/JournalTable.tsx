"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, money } from "@/lib/format";
import type { JournalEntryRow } from "@/lib/data/journal";

const SOURCES = [
  "manual", "voucher", "sale", "purchase", "payment", "receipt",
  "expense", "production", "handover", "contra", "opening",
  "closing", "scheme", "adjustment", "reconciliation",
] as const;

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function JournalTable({ entries }: { entries: JournalEntryRow[] }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (source && e.source !== source) return false;
      if (!q) return true;
      return (
        e.entry_no.toLowerCase().includes(q) ||
        (e.narration ?? "").toLowerCase().includes(q) ||
        (e.postedByName ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, query, source]);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entry no, narration, posted by…"
          className="sm:max-w-[320px]"
        />
        <Select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="sm:max-w-[180px]"
          aria-label="Filter by source"
        >
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>{titleCase(s)}</option>
          ))}
        </Select>
        {(query || source) && (
          <span className="text-[12px] text-ink-4">
            {fmtCount(filtered.length)} of {fmtCount(entries.length)} entries
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching entries"
          description="No journal entries match the current search and filter — clear them to see the full day book."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Entry No</TH>
              <TH>Date</TH>
              <TH>Source</TH>
              <TH>Narration</TH>
              <TH numeric>Amount</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((e) => (
              <TR key={e.id} interactive>
                <TD className="p-0">
                  <Link href={`/journal/${e.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">
                    {e.entry_no}
                  </Link>
                </TD>
                <TD>{dateIST(e.entry_date)}</TD>
                <TD className="text-[12px] text-ink-3">{titleCase(e.source)}</TD>
                <TD className="max-w-[360px] truncate text-ink-2">{e.narration ?? "—"}</TD>
                <TD numeric className="tnum">{money(e.debitTotal)}</TD>
                <TD><StatusBadge status={e.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
