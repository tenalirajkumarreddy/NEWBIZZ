import Link from "next/link";
import { NewPriceListForm } from "./NewPriceListForm";

export default async function NewPriceListPage() {
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/pricing" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Rate Master
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New price list</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Create a named price list — then add items and their selling prices to it.
        </p>
      </div>
      <NewPriceListForm />
    </div>
  );
}
