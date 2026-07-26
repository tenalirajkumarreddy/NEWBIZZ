import Link from "next/link";
import { notFound } from "next/navigation";
import { getBom } from "@/lib/data/bom";
import { listItems } from "@/lib/data/catalog";
import { listAlternateGroups } from "@/lib/data/bom";
import { CloneBomForm } from "./CloneBomForm";

export const metadata = { title: "Clone BOM — NEWBIZZ" };

export default async function CloneBomPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [bom, items, altGroups] = await Promise.all([
    getBom(id),
    listItems({ limit: 2000 }),
    listAlternateGroups(),
  ]);
  if (!bom) notFound();

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href={`/bom/${id}`} className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← {bom.parentSku}
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">
          Clone BOM — {bom.parentSku}
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Create a new BOM pre-filled with the same structure as the existing one.
        </p>
      </div>
      <CloneBomForm bom={bom} items={items} altGroups={altGroups} />
    </div>
  );
}
