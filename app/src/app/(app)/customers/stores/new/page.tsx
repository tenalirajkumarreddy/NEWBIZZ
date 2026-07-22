import Link from "next/link";
import { listCustomers } from "@/lib/data/customers";
import { listPriceLists } from "@/lib/data/catalog";
import { StorePickerForm } from "./StorePickerForm";

export default async function StandaloneNewStorePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const sp = await searchParams;
  const [customers, priceLists] = await Promise.all([
    listCustomers({ limit: 1000 }),
    listPriceLists(),
  ]);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/customers" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Customers
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New store</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Add a ship-to store under an existing customer. Need a new customer first?{" "}
          <Link href="/customers/new" className="text-brand hover:underline">Create a customer</Link>.
        </p>
      </div>
      <StorePickerForm
        customers={customers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        priceLists={priceLists}
        initialCustomerId={sp.customer ?? ""}
      />
    </div>
  );
}
