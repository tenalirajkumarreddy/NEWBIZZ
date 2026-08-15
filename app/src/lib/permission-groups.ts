// =====================================================================
// lib/permission-groups.ts — human grouping of the permission catalog.
//
// Every permission code is `page.action` (e.g. "invoice.view"). We group by the
// page prefix so the Permissions & access screen and the roles page can render
// one section per page instead of a flat wall of toggles. Client-safe (no
// `server-only`) so both client components and server pages can use it.
// =====================================================================

// Page prefix -> human label. Order of keys below = section order on screen.
const PAGE_GROUP_LABELS: Record<string, string> = {
  invoice: "Sales & Invoicing",
  cashmemo: "Sales & Invoicing",
  order: "Orders & Challans",
  challan: "Orders & Challans",
  receipt: "Receipts",
  payment: "Collections",
  customer: "Customers",
  credit: "Credit",
  creditnote: "Credit Notes & Schemes",
  supplier: "Suppliers",
  purchase: "Purchasing",
  item: "Item Master",
  stock: "Stock & Handover",
  inventory: "Inventory",
  pricing: "Rate Master",
  bom: "BOM / Recipes",
  production: "Production",
  config: "Costing Config",
  costing: "Costing",
  journal: "Journal & Ledger",
  accounting: "Accounting",
  expense: "Expenses & Petty Cash",
  asset: "Fixed Assets",
  loan: "Loans & EMI",
  report: "Reports",
  bank: "Bank",
  field: "Field Operations",
  crm: "CRM & Complaints",
  whatsapp: "Messaging",
  commission: "Targets & Commissions",
  hr: "HR & Payroll",
  documents: "Documents",
  cash: "Cash & Handover",
  roles: "Roles & Users",
  audit: "Audit",
  license: "Licences",
  settings: "Settings",
  release: "Company Settings",
};

export interface PermissionItem {
  code: string;
  description: string | null;
}

export interface PermissionGroup {
  /** The dot-prefix namespace, e.g. "invoice". */
  page: string;
  label: string;
  items: PermissionItem[];
}

/** Group permissions by their dot-prefix, in the fixed section order above. */
export function groupPermissions(permissions: PermissionItem[]): PermissionGroup[] {
  const known = new Set(Object.keys(PAGE_GROUP_LABELS));
  const order = [...known];

  const sorted = [...permissions].sort((a, b) => {
    const ap = a.code.split(".")[0];
    const bp = b.code.split(".")[0];
    const ai = order.indexOf(ap);
    const bi = order.indexOf(bp);
    if (ai !== bi) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.code.localeCompare(b.code);
  });

  const groups: PermissionGroup[] = [];
  for (const p of sorted) {
    const page = p.code.split(".")[0];
    const last = groups[groups.length - 1];
    if (last && last.page === page) {
      last.items.push(p);
    } else {
      groups.push({
        page,
        label: PAGE_GROUP_LABELS[page] ?? titleCase(page),
        items: [p],
      });
    }
  }
  return groups;
}

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
