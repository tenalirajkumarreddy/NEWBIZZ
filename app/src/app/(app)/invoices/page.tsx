import { redirect } from "next/navigation";

// The invoice register lives on the Sales Desk (§4.5: a recorded sale IS the
// tax invoice — one register, one place to look). Individual invoices still
// resolve at /invoices/[id].
export default function InvoicesPage() {
  redirect("/sales");
}
