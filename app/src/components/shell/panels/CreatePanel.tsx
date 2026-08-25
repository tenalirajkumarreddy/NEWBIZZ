"use client";

// =====================================================================
// components/shell/panels/CreatePanel.tsx — routes to the per-type
// quick create form. Bank documents are link-only; plain never reaches
// here. onCreated(entityType, entityId) hands the binding to the dialog,
// whose keys match ENTITY_LABEL_LOOKUPS in lib/data/documents.ts.
// =====================================================================

import { useState } from "react";
import type { QuickTypeKey } from "@/lib/actions/quick-attach";
import { Button } from "@/components/ui/Button";
import { ExpenseForm } from "./forms/ExpenseForm";
import { SupplierBillForm } from "./forms/SupplierBillForm";
import { GrnForm } from "./forms/GrnForm";
import { SupplierPaymentForm } from "./forms/SupplierPaymentForm";
import { CustomerReceiptForm } from "./forms/CustomerReceiptForm";

export function CreatePanel({ typeKey, onCreated }: {
  typeKey: QuickTypeKey;
  onCreated: (entityType: string, entityId: string) => void;
}) {
  const [creating, setCreating] = useState(true);

  if (!creating) {
    return (
      <div className="py-2 text-[12px] text-ink-4">
        Record created — finishing attachment…
      </div>
    );
  }

  switch (typeKey) {
    case "expense": return <ExpenseForm onCreated={onCreated} />;
    case "supplier_bill": return <SupplierBillForm onCreated={onCreated} />;
    case "purchase_grn": return <GrnForm onCreated={onCreated} />;
    case "supplier_payment": return <SupplierPaymentForm onCreated={onCreated} />;
    case "customer_receipt": return <CustomerReceiptForm onCreated={onCreated} />;
    default:
      return (
        <div className="flex flex-col items-start gap-2 py-2">
          <p className="text-[12px] text-ink-4">This type links to existing records only.</p>
          <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>OK</Button>
        </div>
      );
  }
}
