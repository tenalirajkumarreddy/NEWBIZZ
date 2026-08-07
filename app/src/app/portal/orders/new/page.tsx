import { getPortalStores, getPortalCatalog } from "@/lib/data/portal";
import { PortalNav } from "@/components/portal/PortalNav";
import { PageHeading } from "@/components/portal/PageHeading";
import { OrderForm } from "@/components/portal/OrderForm";

export default async function PortalNewOrderPage() {
  const [stores, catalog] = await Promise.all([getPortalStores(), getPortalCatalog()]);

  return (
    <>
      <PortalNav />
      <PageHeading
        eyebrow="Customer portal"
        title="Place an order"
        subtitle="Tell us what you need — our team confirms and invoices it."
      />
      {stores.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-8 text-center text-[13px] text-ink-3">
          You don&apos;t have any active store locations to order for. Contact your
          distributor.
        </div>
      ) : (
        <OrderForm stores={stores} catalog={catalog} />
      )}
    </>
  );
}