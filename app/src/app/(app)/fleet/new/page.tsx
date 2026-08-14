import { PageContainer, PageHeader } from "@/components/ui";
import { VehicleForm } from "./VehicleForm";

export const metadata = { title: "Add Vehicle — NEWBIZZ" };

export default function NewVehiclePage() {
  return (
    <PageContainer width="narrow">
      <PageHeader title="Add Vehicle" backHref="/fleet" backLabel="Vehicles" />
      <VehicleForm />
    </PageContainer>
  );
}
