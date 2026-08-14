import type { ReactNode } from "react";
import { PageContainer, PageHeader } from "@/components/ui/Page";
import { CommissionsTabNav } from "./CommissionsTabNav";

export const metadata = { title: "Targets & Commissions - NEWBIZZ" };

export default function CommissionsLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer width="wide">
      <PageHeader title="Targets & Commissions" />
      <CommissionsTabNav />
      {children}
    </PageContainer>
  );
}
