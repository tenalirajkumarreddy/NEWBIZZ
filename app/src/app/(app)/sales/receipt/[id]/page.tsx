import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/data/types";
import { getInvoice } from "@/lib/data/sales";
import { getCompany } from "@/lib/data/settings";
import { ReceiptSheet, type ReceiptCompany } from "../../ReceiptSheet";
import { PageContainer, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// Field acknowledgment receipt: a read-only, printable cash-memo acknowledgement
// for the field user who just recorded the sale. The memo row lives in the
// invoices table with is_official=false; the user reads it because they are the
// created_by owner (RLS). Register access also allows viewing, defensively.
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const row = unwrap(
    await supabase
      .from("invoices")
      .select("created_by, is_official, invoice_no")
      .eq("id", id)
      .maybeSingle(),
    null as { created_by: string | null; is_official: boolean; invoice_no: string } | null,
    "receipt:ownership",
  );
  if (!row) notFound();

  const hasRegisterAccess = can(session.claims, "invoice.view") || can(session.claims, "cashmemo.view");
  if (session.user.id !== row.created_by && !hasRegisterAccess) notFound();

  const [detail, company] = await Promise.all([getInvoice(id), getCompany()]);
  if (!detail) notFound();

  const companySheet: ReceiptCompany | null = company
    ? {
        legalName: company.legalName,
        address: company.address,
        gstin: company.primaryGstin,
      }
    : null;

  return (
    <PageContainer width="report">
      <PageHeader
        backHref="/sales"
        backLabel="Sales Desk"
        title="Acknowledgment receipt"
        subtitle={`${detail.invoice_no} · ${detail.isOfficial ? "Tax invoice" : "Cash memo (no GST)"}`}
      />
      <ReceiptSheet
        invoice={detail}
        company={companySheet}
        userName={session.user.user_metadata?.full_name ?? "Cash Memo"}
      />
    </PageContainer>
  );
}