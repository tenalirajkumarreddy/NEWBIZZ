import Link from "next/link";
import { NewLoanForm } from "./NewLoanForm";

export default function NewLoanPage() {
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/loans" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Loans &amp; EMI</Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Add loan</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">Records the loan and generates its reducing-balance EMI schedule.</p>
      </div>
      <NewLoanForm />
    </div>
  );
}
