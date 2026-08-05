import { getDocuments } from "@/lib/data/documents";
import { DocumentsView } from "./DocumentsView";

export const metadata = { title: "Documents — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const page = await getDocuments({});

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Documents</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">Central vault for files attached to any record.</p>
        </div>
      </div>
      <DocumentsView initial={page} />
    </div>
  );
}