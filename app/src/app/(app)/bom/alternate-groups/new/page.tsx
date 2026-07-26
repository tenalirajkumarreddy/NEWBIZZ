import Link from "next/link";
import { NewAltGroupForm } from "./NewAltGroupForm";

export const metadata = { title: "New Alternate Group — NEWBIZZ" };

export default async function NewAltGroupPage() {
  return (
    <div className="mx-auto flex max-w-[660px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/bom/alternate-groups" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Alternate Groups
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New Alternate Group</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Define a set of substitute items. BOM components can reference this group instead of a single item.
        </p>
      </div>
      <NewAltGroupForm />
    </div>
  );
}
