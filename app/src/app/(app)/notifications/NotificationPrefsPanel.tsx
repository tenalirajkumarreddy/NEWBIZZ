"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { setNotificationPreference, type NotifChannel } from "@/lib/actions/notifications";
import { CATEGORY_LABELS } from "@/components/shell/notificationLabels";

interface PrefRow {
  category: string;
  channel: NotifChannel;
  enabled: boolean;
}

interface Props {
  prefs: PrefRow[];
}

const CHANNELS: { key: NotifChannel; label: string; hint: string }[] = [
  { key: "whatsapp", label: "WhatsApp", hint: "Instant chat" },
  { key: "sms", label: "SMS", hint: "Text message" },
  { key: "email", label: "Email", hint: "Inbox" },
];

const CATEGORIES: { key: string; hint: string }[] = [
  { key: "order", hint: "New orders, approvals, lifecycle" },
  { key: "invoice", hint: "Invoices posted or voided" },
  { key: "receipt", hint: "Customer collections" },
  { key: "credit_note", hint: "Credit notes & sales returns" },
  { key: "supplier_bill", hint: "AP bills & supplier payments" },
  { key: "payment", hint: "Money in / money out" },
  { key: "challan", hint: "Delivery challans" },
  { key: "purchase", hint: "POs, GRNs, receipts" },
  { key: "inventory", hint: "Inventory movements & alerts" },
  { key: "transfer", hint: "Handovers & deposits" },
  { key: "expense", hint: "Expense approval queue" },
  { key: "complaint", hint: "CRM complaints" },
  { key: "production", hint: "Production runs" },
  { key: "commission", hint: "Commission runs" },
  { key: "payroll", hint: "Payroll runs" },
  { key: "loan", hint: "EMIs & loans" },
  { key: "license", hint: "Licence expiry" },
  { key: "voucher", hint: "Manual vouchers" },
  { key: "bank", hint: "Bank reconciliation" },
  { key: "system", hint: "Platform & maintenance notices" },
];

export function NotificationPrefsPanel({ prefs }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const enabledMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of prefs) m.set(`${p.category}:${p.channel}`, p.enabled);
    return m;
  }, [prefs]);

  const enabled = (category: string, channel: NotifChannel) => enabledMap.get(`${category}:${channel}`) ?? true;

  async function toggle(category: string, channel: NotifChannel, value: boolean) {
    const key = `${category}:${channel}`;
    setBusy((prev) => new Set(prev).add(key));
    try {
      const res = await setNotificationPreference({ category, channel, enabled: value });
      if (res.ok) {
        toast.success(value ? `${CATEGORY_LABELS[category] ?? category} · ${channel} on` : `${CATEGORY_LABELS[category] ?? category} · ${channel} muted`);
        enabledMap.set(key, value);
      } else {
        toast.error(res.error ?? "Failed to update preference");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update preference");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-line pb-2">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">External channel preferences</h2>
          <p className="text-[11px] text-ink-3">
            In-app notifications always fire. Choose whether each event category also alerts you via WhatsApp, SMS or email.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-fill">
              <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Category</th>
              {CHANNELS.map((c) => (
                <th key={c.key} className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <span className="block">{c.label}</span>
                  <span className="block text-[10px] font-normal normal-case tracking-normal text-ink-4">{c.hint}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat.key} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <div className="text-[13px] font-medium text-ink">{CATEGORY_LABELS[cat.key] ?? cat.key}</div>
                  <div className="text-[11px] text-ink-4">{cat.hint}</div>
                </td>
                {CHANNELS.map((ch) => {
                  const on = enabled(cat.key, ch.key);
                  const key = `${cat.key}:${ch.key}`;
                  const isBusy = busy.has(key);
                  return (
                    <td key={ch.key} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${CATEGORY_LABELS[cat.key] ?? cat.key} ${ch.label}`}
                        disabled={isBusy}
                        onClick={() => toggle(cat.key, ch.key, !on)}
                        className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
                          on ? "justify-end bg-brand" : "justify-start bg-line-strong"
                        }`}
                      >
                        <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
