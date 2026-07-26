import Link from "next/link";
import { notFound } from "next/navigation";
import { getVehicle } from "@/lib/data/fleet";
import { TripForm } from "./TripForm";

export const metadata = { title: "Start Trip — NEWBIZZ" };

export default async function NewTripPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-4 px-6 py-6 lg:px-8">
      <Link href={`/fleet/${id}`} className="text-[13px] text-link hover:underline">
        ← {vehicle.regNo}
      </Link>
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Start Trip</h1>
      <TripForm vehicleId={id} />
    </div>
  );
}
