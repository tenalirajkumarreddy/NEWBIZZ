"use client";

// =====================================================================
// NewTransferPanel — create a handover (§4.7). Three modes:
//   cash     my custody → another user
//   deposit  my custody → bank (posts immediately: Dr 1120 / Cr 2140-me)
//   stock    warehouse → user (issue), my custody → user, or my custody →
//            warehouse (return)
// The DB RPC enforces permissions and balances; this form only guides.
//
// Role gating (§2.3 baseline matrix):
//   Admin/Manager  → all modes, full origin/dest
//   Operator       → Stock (WH→user only) + Cash + Deposit
//   Agent          → Stock (self→user/WH) + Cash + Deposit
//   Sales          → Cash + Deposit only
//   Marketer       → Cash + Deposit only
// =====================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { money, qty as fmtQty } from "@/lib/format";
import { can } from "@/lib/auth/claims";
import {
  createCashTransfer,
  createStockTransfer,
  type StockTransferLineInput,
} from "@/lib/actions/transfers";
import type { UserOption } from "@/lib/data/holdings";
import type { AppClaims } from "@/lib/auth/claims";
import type { BranchOption, StockableItemOption } from "@/lib/data/stock";

type Mode = "cash" | "deposit" | "stock";
type StockOrigin = "warehouse" | "self";
type StockDest = "user" | "warehouse";

interface MyStockLine {
  itemId: string;
  sku: string;
  name: string;
  qty: number;
  baseUnitCode: string | null;
}

interface Line {
  key: number;
  itemId: string;
  qty: string;
}

type StockConfig = "full" | "wh2user" | "self2any";

export function NewTransferPanel({
  claims,
  users,
  branches,
  items,
  myUserId,
  myCash,
  myStock,
  bare = false,
  onDone,
}: {
  claims: AppClaims;
  users: UserOption[];
  branches: BranchOption[];
  items: StockableItemOption[];
  myUserId: string | null;
  myCash: number;
  myStock: MyStockLine[];
  // Render without the surrounding Panel — used when hosted in a Drawer,
  // where the Drawer header already carries the title.
  bare?: boolean;
  // Called after a successful transfer/deposit when hosted in a Drawer so
  // the drawer can close. Undefined on the inline page render.
  onDone?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const isAdmin = claims.is_admin;
  const roles = claims.roles;
  const scopeAll = isAdmin || roles.includes("manager");
  const isOperator = roles.includes("operator");
  const isAgent = roles.includes("agent");
  const hasStockTransfer = can(claims, "stock.transfer");

  const stockConfig: StockConfig | null = useMemo(() => {
    if (!hasStockTransfer) return null;
    if (scopeAll) return "full";
    if (isOperator) return "wh2user";
    if (isAgent) return "self2any";
    return null;
  }, [hasStockTransfer, scopeAll, isOperator, isAgent]);

  const availableModes = useMemo(() => {
    const modes: Mode[] = [];
    if (stockConfig) modes.push("stock");
    modes.push("cash", "deposit");
    return modes;
  }, [stockConfig]);

  const others = useMemo(() => users.filter((u) => u.id !== myUserId), [users, myUserId]);

  const [mode, setMode] = useState<Mode>(() => stockConfig ? "stock" : "cash");
  const [origin, setOrigin] = useState<StockOrigin>(
    stockConfig === "wh2user" ? "warehouse" : stockConfig === "self2any" ? "self" : "warehouse"
  );
  const [dest, setDest] = useState<StockDest>(
    stockConfig === "wh2user" ? "user" : "user"
  );
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [toUserId, setToUserId] = useState(others[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, itemId: "", qty: "" }]);
  const [nextKey, setNextKey] = useState(2);

  // Item options depend on origin: warehouse issues any stockable item;
  // self-origin can only hand over what I actually hold.
  const itemOptions = useMemo(() => {
    if (mode !== "stock" || origin === "warehouse")
      return items.map((i) => ({ id: i.id, label: `${i.sku} — ${i.name}`, max: null as number | null }));
    return myStock.map((s) => ({
      id: s.itemId,
      label: `${s.sku} — ${s.name} (holding ${fmtQty(s.qty)}${s.baseUnitCode ? ` ${s.baseUnitCode}` : ""})`,
      max: s.qty,
    }));
  }, [mode, origin, items, myStock]);

  const filled = lines.filter((l) => l.itemId && Number(l.qty) > 0);
  const overHolding =
    origin === "self" &&
    filled.some((l) => {
      const held = myStock.find((s) => s.itemId === l.itemId)?.qty ?? 0;
      return Number(l.qty) > held;
    });

  const canSubmit =
    !pending &&
    (mode === "deposit"
      ? Number(amount) > 0
      : mode === "cash"
        ? Number(amount) > 0 && !!toUserId
        : filled.length > 0 &&
          !overHolding &&
          (origin === "warehouse" ? !!branchId && !!toUserId : dest === "user" ? !!toUserId : !!branchId));

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function reset() {
    setAmount("");
    setNote("");
    setLines([{ key: nextKey, itemId: "", qty: "" }]);
    setNextKey((k) => k + 1);
  }

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res =
        mode === "stock"
          ? await createStockTransfer({
              ...(origin === "warehouse"
                ? { fromBranchId: branchId, toUserId }
                : dest === "user"
                  ? { fromSelf: true, toUserId }
                  : { fromSelf: true, toBranchId: branchId }),
              lines: filled.map((l): StockTransferLineInput => ({ item_id: l.itemId, qty: Number(l.qty) })),
              ...(note ? { note } : {}),
            })
          : await createCashTransfer({
              amount: Number(amount),
              ...(mode === "deposit" ? { deposit: true } : { toUserId }),
              ...(note ? { note } : {}),
            });
      if (res.ok) {
        toast.success(
          mode === "deposit" ? "Bank deposit posted" : "Transfer created",
          mode === "deposit"
            ? `${money(Number(amount))} moved from your custody to the bank.`
            : "It is pending until the receiver accepts.",
        );
        reset();
        if (onDone) onDone();
        router.refresh();
      } else {
        toast.error("Nothing was created", res.error);
      }
    });
  }

  const body = (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="What moves" htmlFor="t-mode">
          <Select id="t-mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {availableModes.map((m) => (
              <option key={m} value={m}>
                {m === "stock" ? "Stock" : m === "cash" ? "Cash → another user" : "Cash → bank deposit"}
              </option>
            ))}
          </Select>
        </Field>

          {mode === "stock" && stockConfig && (
            <>
              {stockConfig !== "wh2user" && (
                <Field label="From" htmlFor="t-origin">
                  <Select
                    id="t-origin"
                    value={origin}
                    onChange={(e) => {
                      setOrigin(e.target.value as StockOrigin);
                      setLines([{ key: nextKey, itemId: "", qty: "" }]);
                      setNextKey((k) => k + 1);
                    }}
                    disabled={stockConfig === "self2any"}
                  >
                    {stockConfig === "full" && <option value="warehouse">Warehouse</option>}
                    <option value="self">My custody</option>
                  </Select>
                </Field>
              )}
              {stockConfig !== "wh2user" ? (
                <Field label="To" htmlFor="t-dest">
                  <Select
                    id="t-dest"
                    value={dest}
                    onChange={(e) => setDest(e.target.value as StockDest)}
                  >
                    <option value="user">A user</option>
                    {origin === "self" && <option value="warehouse">Back to warehouse</option>}
                  </Select>
                </Field>
              ) : (
                <div className="text-[13px] text-ink-3 self-end pb-2">
                  Warehouse → user
                </div>
              )}
            </>
          )}

          {mode !== "stock" && (
            <Field label="Amount (₹)" required htmlFor="t-amount" hint={`You hold ${money(myCash)}`}>
              <Input
                id="t-amount"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
          )}

          {mode === "cash" && (
            <Field label="Receiver" required htmlFor="t-to">
              <Select id="t-to" value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
                {others.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {mode === "stock" && (
          <div className="grid gap-4 sm:grid-cols-3">
            {(origin === "warehouse" || dest === "warehouse") && (
              <Field
                label={origin === "warehouse" ? "Issuing warehouse" : "Receiving warehouse"}
                required
                htmlFor="t-branch"
              >
                <Select id="t-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            {(origin === "warehouse" || dest === "user") && (
              <Field label="Receiving user" required htmlFor="t-touser">
                <Select id="t-touser" value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
                  {others.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        )}

        {mode === "stock" && (
          <div className="flex flex-col gap-2">
            {lines.map((l) => {
              const opt = l.itemId ? itemOptions.find((o) => o.id === l.itemId) : undefined;
              const over = opt?.max != null && Number(l.qty) > opt.max;
              return (
                <div key={l.key} className="grid gap-2 sm:grid-cols-[1fr_140px_60px]">
                  <Select
                    value={l.itemId}
                    onChange={(e) => setLine(l.key, { itemId: e.target.value })}
                    aria-label="Item"
                  >
                    <option value="">Select item…</option>
                    {itemOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </Select>
                  <div>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={l.qty}
                      onChange={(e) => setLine(l.key, { qty: e.target.value })}
                      placeholder="Qty"
                      aria-label="Quantity"
                    />
                    {over && (
                      <p className="mt-1 text-[11px] text-red-600">More than you hold.</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                  >
                    ✕
                  </Button>
                </div>
              );
            })}
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setLines((ls) => [...ls, { key: nextKey, itemId: "", qty: "" }]);
                  setNextKey((k) => k + 1);
                }}
              >
                + Add line
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Note" htmlFor="t-note">
            <Input
              id="t-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional context — route, order, reason"
            />
          </Field>
          <Button onClick={submit} disabled={!canSubmit} loading={pending}>
            {mode === "deposit" ? "Post bank deposit" : "Create transfer"}
          </Button>
        </div>
      </div>
  );

  if (bare) return body;

  return (
    <Panel
      title="New handover"
      subtitle={`Your custody right now: ${money(myCash)} cash · ${fmtQty(myStock.reduce((s, x) => s + x.qty, 0))} units of stock`}
    >
      {body}
    </Panel>
  );
}
