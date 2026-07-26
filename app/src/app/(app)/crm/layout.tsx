import type { ReactNode } from "react";
import { CrmTabNav } from "./CrmTabNav";

export const metadata = { title: "CRM & Complaints — NEWBIZZ" };

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">CRM &amp; Complaints</h1>
      <CrmTabNav />
      {children}
    </div>
  );
}
