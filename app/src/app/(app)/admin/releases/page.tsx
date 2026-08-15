import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/claims";
import { todayIST } from "@/lib/constants";
import { listReleaseCounts } from "@/lib/data/releases";
import { ReleaseCenter } from "./ReleaseCenter";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata = { title: "Release Center — NEWBIZZ" };
export const dynamic = "force-dynamic";

// Release Center — the month-end handover. Managers (release.manage) pick the
// registers and date range, then release the batch so accountants with view-only
// codes can see those documents (the fine-grained RLS gate). Releases are
// permanent and audited, so this is deliberately gated as carefully as roles.
export default async function ReleaseCenterPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(session.claims.is_admin || can(session.claims, "release.manage"))) redirect("/no-access");

  // Default period: the current IST month — first day through today.
  const to = todayIST();
  const from = `${to.slice(0, 8)}01`;
  const counts = await listReleaseCounts(from, to);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Release Center"
        subtitle="Release documents to accountants after your month-end review. Once released, a document stays visible to the books forever."
      />
      <ReleaseCenter counts={counts} from={from} to={to} />
    </PageContainer>
  );
}