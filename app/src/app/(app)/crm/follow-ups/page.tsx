import { listFollowUps } from "@/lib/data/crm";
import { FollowUpPanel } from "./FollowUpPanel";

export const dynamic = "force-dynamic";

export default async function CrmFollowUpsPage() {
  const followUps = await listFollowUps();
  return <FollowUpPanel items={followUps} />;
}
