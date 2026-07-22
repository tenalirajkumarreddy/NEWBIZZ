import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/data/customers";
import { EditCustomerForm } from "./EditCustomerForm";

export default async function EditCustomerPage({ params }: { params: { id: string } }) {
  const customer = await getCustomer(params.id);
  if (!customer) notFound();

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href={`/customers/${customer.id}`} className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← {customer.name}
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Edit customer</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Code <span className="font-mono">{customer.code}</span> is fixed — everything else can change.
        </p>
      </div>
      <EditCustomerForm customer={customer} />
    </div>
  );
}
