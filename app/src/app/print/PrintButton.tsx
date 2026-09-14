"use client";

import { Button } from "@/components/ui/Button";

// Screen-only trigger for the print sheets: calls the browser's print dialog.
// Hide the wrapper (or this button) with print:hidden so it never lands on
// paper — the document itself is fully server-rendered.
export function PrintButton({ className }: { className?: string }) {
  return (
    <Button
      variant="primary"
      size="md"
      className={className}
      onClick={() => window.print()}
    >
      Print
    </Button>
  );
}
