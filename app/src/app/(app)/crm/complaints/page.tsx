import { listComplaints } from "@/lib/data/crm";
import { ComplaintsTable } from "./ComplaintsTable";

export const dynamic = "force-dynamic";

export default async function CrmComplaintsPage() {
  const complaints = await listComplaints();
  return <ComplaintsTable complaints={complaints} />;
}
