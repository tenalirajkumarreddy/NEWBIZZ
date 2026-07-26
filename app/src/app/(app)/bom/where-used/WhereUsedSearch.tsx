"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function WhereUsedSearch({ initialItemId }: { initialItemId: string }) {
  const router = useRouter();
  const [itemId, setItemId] = useState(initialItemId);

  function search() {
    if (!itemId.trim()) return;
    router.push(`/bom/where-used?itemId=${encodeURIComponent(itemId.trim())}`);
  }

  return (
    <Card className="p-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="Item ID" htmlFor="wu_item_id" hint="UUID of the item or alternate group">
            <Input
              id="wu_item_id"
              mono
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="Paste an item UUID…"
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </Field>
        </div>
        <Button variant="primary" size="sm" onClick={search}>
          Search
        </Button>
      </div>
    </Card>
  );
}
