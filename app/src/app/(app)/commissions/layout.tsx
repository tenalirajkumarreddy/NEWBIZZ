import type { ReactNode } from "react";
import { CommissionsTabNav } from "./CommissionsTabNav";

export const metadata = { title: "Targets & Commissions — NEWBIZZ" };

export default function CommissionsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6 lg:px-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Targets &amp; Commissions</h1>
      <CommissionsTabNav />
      {children}
    </div>
  );
}
