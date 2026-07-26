import { listCampaigns } from "@/lib/data/crm";
import { CampaignsTable } from "./CampaignsTable";

export const dynamic = "force-dynamic";

export default async function CrmCampaignsPage() {
  const campaigns = await listCampaigns();
  return <CampaignsTable campaigns={campaigns} />;
}
