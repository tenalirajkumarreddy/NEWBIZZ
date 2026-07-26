import Link from "next/link";
import { VehicleForm } from "./VehicleForm";

export const metadata = { title: "Add Vehicle — NEWBIZZ" };

export default function NewVehiclePage() {
  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-4 px-6 py-6 lg:px-8">
      <Link href="/fleet" className="text-[13px] text-link hover:underline">← Vehicles</Link>
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Add Vehicle</h1>
      <VehicleForm />
    </div>
  );
}
