import Link from "next/link";
import { listItems } from "@/lib/data/catalog";
import { NewRunForm } from "./NewRunForm";

export const metadata = { title: "New Production Run — NEWBIZZ" };

export default async function NewRunPage() {
  const items = await listItems({ limit: 2000 });

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/production" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Production Runs
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New Production Run</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Post an atomic EOD run — inputs are auto-resolved from the active BOM.
        </p>
      </div>
      <NewRunForm items={items} />
    </div>
  );
}
