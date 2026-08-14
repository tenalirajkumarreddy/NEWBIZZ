import { notFound } from "next/navigation";
import { getVehicle } from "@/lib/data/fleet";
import { TripForm } from "./TripForm";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata = { title: "Start Trip — NEWBIZZ" };

export default async function NewTripPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  return (
    <PageContainer width="narrow">
      <PageHeader title="Start Trip" backHref={`/fleet/${id}`} backLabel={vehicle.regNo} />
      <TripForm vehicleId={id} />
    </PageContainer>
  );
}
