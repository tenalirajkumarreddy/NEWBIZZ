import type { ReactNode } from "react";
import { PageContainer, PageHeader } from "@/components/ui/Page";
import { CrmTabNav } from "./CrmTabNav";

export const metadata = { title: "CRM & Complaints - NEWBIZZ" };

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer>
      <PageHeader title="CRM & Complaints" />
      <CrmTabNav />
      {children}
    </PageContainer>
  );
}
