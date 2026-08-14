import { notFound } from "next/navigation";
import { getVehicle } from "@/lib/data/fleet";
import { FuelForm } from "./FuelForm";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata = { title: "Log Fuel — NEWBIZZ" };

export default async function NewFuelPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  return (
    <PageContainer width="narrow">
      <PageHeader title="Log Fuel" backHref={`/fleet/${id}`} backLabel={vehicle.regNo} />
      <FuelForm vehicleId={id} />
    </PageContainer>
  );
}
