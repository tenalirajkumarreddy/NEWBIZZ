"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { money } from "@/lib/format";
import { disposeFixedAsset } from "@/lib/actions/assets";

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// Dispose an asset (§5.7): enter sale proceeds, preview gain/loss vs WDV, and
// post the disposal entry (reverse gross block + accumulated dep, book proceeds
// and the balancing gain/loss).
export function DisposeAssetPanel({ assetId, assetNo, wdv }: { assetId: string; assetNo: string; wdv: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [proceeds, setProceeds] = useState("");
  const [date, setDate] = useState(todayIST());

  const gain = (Number(proceeds) || 0) - wdv;

  function onDispose() {
    startTransition(async () => {
      const res = await disposeFixedAsset(assetId, Number(proceeds) || 0, date);
      if (res.ok) {
        toast.success("Asset disposed", `${assetNo} removed from the block.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Could not dispose asset", res.error);
      }
    });
  }

  if (!open) {
    return (
      <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[13px] font-semibold text-ink">Dispose asset</div>
          <p className="mt-0.5 text-[12px] text-ink-3">Sell or scrap this asset; books gain/loss against its written-down value.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Dispose</Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="text-[13px] font-semibold text-ink">Dispose asset</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sale proceeds (₹)" required hint="0 if scrapped">
          <Input type="number" min={0} step="any" value={proceeds} onChange={(e) => setProceeds(e.target.value)} className="text-right" placeholder="0.00" />
        </Field>
        <Field label="Disposal date" required>
          <Input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center justify-between rounded-md bg-fill px-3 py-2 text-[12px]">
        <span className="text-ink-3">WDV {money(wdv)} · proceeds {money(Number(proceeds) || 0)}</span>
        <span className={"font-mono font-semibold tnum " + (gain >= 0 ? "text-grn" : "text-amb")}>
          {gain >= 0 ? "Gain" : "Loss"} {money(Math.abs(gain))}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
        <Button variant="danger" size="sm" onClick={onDispose} loading={pending}>Confirm disposal</Button>
      </div>
    </Card>
  );
}
