import Link from "next/link";
import { PageContainer } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

// Branded 404 for the authenticated app — replaces Next's bare notFound() view.
export default function NotFound() {
  return (
    <PageContainer>
      <div className="border border-line bg-surface shadow-card">
        <EmptyState
          title="Page not found"
          description="The page you're looking for doesn't exist, or has been moved."
          action={
            <Link href="/">
              <Button variant="primary" size="sm">Back to Dashboard</Button>
            </Link>
          }
        />
      </div>
    </PageContainer>
  );
}