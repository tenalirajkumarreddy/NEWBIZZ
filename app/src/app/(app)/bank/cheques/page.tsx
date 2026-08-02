import { listCheques } from "@/lib/data/bank";
import { ChequeRegister } from "./ChequeRegister";

export const metadata = { title: "Cheque Register — Bank Reconciliation — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function ChequesPage() {
  const cheques = await listCheques();
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <a href="/bank" className="text-[13px] text-brand hover:underline">&larr; Back to Bank &amp; Credit Cards</a>
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Cheque Register</h1>
      <ChequeRegister cheques={cheques} />
    </div>
  );
}
