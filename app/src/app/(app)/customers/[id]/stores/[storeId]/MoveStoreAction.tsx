"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { moveStore } from "@/lib/actions/customers";

export function MoveStoreAction({
  storeId,
  currentCustomerId,
  currentCustomerName,
}: {
  storeId: string;
  currentCustomerId: string;
  currentCustomerName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<{ id: string; name: string; code: string }[]>([]);
  const [searching, setSearching] = useState(false);

  function openPicker() {
    setOpen(true);
    setQuery("");
    setCustomers([]);
    search("");
  }

  async function search(q: string) {
    setQuery(q);
    setSearching(true);
    try {
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setCustomers((data ?? []).filter((c: { id: string }) => c.id !== currentCustomerId));
    } catch {
      setCustomers([]);
    } finally {
      setSearching(false);
    }
  }

  function doMove(targetId: string, targetName: string) {
    startTransition(async () => {
      const res = await moveStore(storeId, targetId);
      if (res.ok) {
        toast.success("Store moved", `Now owned by ${targetName}`);
        setOpen(false);
        router.push(`/customers/${targetId}`);
        router.refresh();
      } else {
        toast.error("Could not move store", res.error);
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openPicker}>
        Move to another customer
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Move store to another customer"
        description={`Select the new owner for this store. It will be removed from ${currentCustomerName}.`}
        size="lg"
      >
        <div className="flex flex-col gap-2">
          <Input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search customers by name, code, phone…"
            autoFocus
          />
          <div className="mt-1 flex max-h-[300px] flex-col gap-1 overflow-y-auto">
            {searching ? (
              <p className="py-4 text-center text-[13px] text-ink-4">Searching…</p>
            ) : customers.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-ink-4">
                {query ? "No matching customers" : "Start typing to search"}
              </p>
            ) : (
              customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => doMove(c.id, c.name)}
                  disabled={pending}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-fill disabled:opacity-50"
                >
                  <span className="font-mono font-semibold text-brand">{c.code}</span>
                  <span className="font-medium text-ink">{c.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
