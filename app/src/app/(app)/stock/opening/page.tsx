import Link from "next/link";
import { listBranches, listStockableItems } from "@/lib/data/stock";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer, PageHeader } from "@/components/ui";
import { OpeningStockForm } from "./OpeningStockForm";

export const metadata = { title: "Opening Stock — NEWBIZZ" };

export default async function OpeningStockPage() {
  const [branches, items] = await Promise.all([listBranches(), listStockableItems()]);

  return (
    <PageContainer width="report">
      <PageHeader
        title="Load Opening Stock"
        subtitle={
          <>
            One-time setup entry: quantities on hand and their weighted-average cost as of the
            cut-over date. Posts Dr Inventory / Cr Opening Balance Equity per line — the whole
            batch commits in one transaction or not at all.
          </>
        }
        actions={
          <Link href="/stock">
            <Button variant="secondary" size="sm">Back to Warehouse Stock</Button>
          </Link>
        }
      />

      {items.length === 0 || branches.length === 0 ? (
        <Panel>
          <EmptyState
            title={items.length === 0 ? "No stockable items yet" : "No active warehouse"}
            description={
              items.length === 0
                ? "Create your items in the Item Master first, then come back to load their opening quantities."
                : "Create an active branch/warehouse in Settings first."
            }
            action={
              <Link href={items.length === 0 ? "/items/new" : "/"}>
                <Button variant="secondary" size="sm">
                  {items.length === 0 ? "Open Item Master" : "Go to Dashboard"}
                </Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <OpeningStockForm branches={branches} items={items} />
      )}
    </PageContainer>
  );
}
