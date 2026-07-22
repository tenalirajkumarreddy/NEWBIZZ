import Link from "next/link";
import { NewAssetForm } from "./NewAssetForm";

export default function NewAssetPage() {
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/assets" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Fixed Assets</Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Register asset</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">Add a capital asset and set how it depreciates over its life.</p>
      </div>
      <NewAssetForm />
    </div>
  );
}
