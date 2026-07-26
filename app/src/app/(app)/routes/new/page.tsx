import Link from "next/link";
import { RouteForm } from "./RouteForm";

export const metadata = { title: "New Route — NEWBIZZ" };

export default function NewRoutePage() {
  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-4 px-6 py-6 lg:px-8">
      <Link href="/routes" className="text-[13px] text-link hover:underline">← Routes</Link>
      <h1 className="text-[22px] font-bold tracking-tight text-ink">New Route</h1>
      <RouteForm />
    </div>
  );
}
