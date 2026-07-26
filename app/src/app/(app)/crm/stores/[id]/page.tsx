import { notFound } from "next/navigation";
import Link from "next/link";
import { getStore360, listInteractions, listComplaints } from "@/lib/data/crm";
import { getCustomerActivity } from "@/lib/data/customers";
import { listOrders } from "@/lib/data/sales";
import { Store360Client } from "./Store360Client";

export const dynamic = "force-dynamic";

export default async function Store360Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const [data, interactions, complaints] = await Promise.all([
    getStore360(id),
    listInteractions({ storeId: id }),
    listComplaints({ storeId: id }),
  ]);

  if (!data) notFound();

  const activity = await getCustomerActivity(data.store.customerId, { storeId: id }).catch(() => []);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/crm" className="text-[12px] font-medium text-ink-4 hover:text-brand">← CRM</Link>
      <Store360Client data={data} interactions={interactions} complaints={complaints} activity={activity} />
    </div>
  );
}
