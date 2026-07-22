import Link from "next/link";
import { NewCustomerForm } from "./NewCustomerForm";

export default async function NewCustomerPage() {
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/customers" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Customers
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New customer</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Add a billing party — then add their stores to start placing orders.
        </p>
      </div>
      <NewCustomerForm />
    </div>
  );
}
