import Link from "next/link";
import { NewSupplierForm } from "./NewSupplierForm";

export default function NewSupplierPage() {
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/suppliers" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Suppliers
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New supplier</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Add a buy-side party — then build its Approved Vendor List and start purchasing.
        </p>
      </div>
      <NewSupplierForm />
    </div>
  );
}
