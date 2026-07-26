import Link from "next/link";
import { notFound } from "next/navigation";
import { getVehicle } from "@/lib/data/fleet";
import { FuelForm } from "./FuelForm";

export const metadata = { title: "Log Fuel — NEWBIZZ" };

export default async function NewFuelPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-4 px-6 py-6 lg:px-8">
      <Link href={`/fleet/${id}`} className="text-[13px] text-link hover:underline">
        ← {vehicle.regNo}
      </Link>
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Log Fuel</h1>
      <FuelForm vehicleId={id} />
    </div>
  );
}
