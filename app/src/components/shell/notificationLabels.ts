// =====================================================================
// components/shell/notificationLabels.ts — shared label/tone maps for
// notifications. Kept in one place so the bell dropdown and the
// /notifications page render identical category/severity treatment.
// =====================================================================

export const CATEGORY_LABELS: Record<string, string> = {
  order: "Order",
  invoice: "Invoice",
  receipt: "Collection",
  credit_note: "Credit Note",
  supplier_bill: "Supplier Bill",
  payment: "Payment",
  challan: "Challan",
  purchase: "Purchase",
  voucher: "Voucher",
  bank: "Bank",
  stock: "Stock",
  inventory: "Stock",
  transfer: "Transfer",
  expense: "Expense",
  complaint: "Complaint",
  production: "Production",
  commission: "Commission",
  payroll: "Payroll",
  loan: "Loan",
  license: "Licence",
  system: "System",
};

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "";
  return CATEGORY_LABELS[category] ?? titleCase(category);
}

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Compact relative time for the bell dropdown ("5m", "2h", "3d", else the date). */
export function timeAgoShort(value: string | Date | null | undefined): string {
  if (!value) return "";
  const then = typeof value === "string" ? Date.parse(value) : value.getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const date = new Date(then);
  return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}`;
}
