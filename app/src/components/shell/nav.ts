// =====================================================================
// Sidebar navigation model — the locked grouped nav from the prototype.
//
// Each item may carry a `perm`; the shell hides items the user's claims don't
// satisfy (UI gating only — the DB still guards every action). Items with no
// perm are visible to any active user. `perm` codes match the 16-code catalog
// used by has_permission()/role_permissions.
// =====================================================================

export interface NavItem {
  id: string;
  label: string;
  href: string;
  perm?: string;
  badgeKey?: string; // resolved to a live count by the shell (optional)
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/" },
      { id: "notifications", label: "Notifications", href: "/notifications", badgeKey: "unread" },
    ],
  },
  {
    label: "Sell & Collect",
    items: [
      { id: "sales", label: "Sales Desk", href: "/sales", perm: "invoice.view", badgeKey: "openOrders" },
      { id: "orders", label: "Order Book", href: "/orders", perm: "order.view" },
      { id: "challans", label: "Delivery Challans", href: "/challans", perm: "order.view" },
      { id: "receipts", label: "Collections", href: "/receipts", perm: "receipt.record" },
      { id: "customers", label: "Customers & Stores", href: "/customers", perm: "customer.manage" },
      { id: "credit", label: "Credit Management", href: "/credit", perm: "customer.manage" },
      { id: "creditnotes", label: "Credit Notes & Schemes", href: "/credit-notes", perm: "creditnote.view" },
    ],
  },
  {
    label: "Messaging",
    items: [
      { id: "whatsapp", label: "WhatsApp Inbox", href: "/whatsapp", perm: "customer.manage", badgeKey: "whatsappUnread" },
    ],
  },
  {
    label: "Buy & Stock",
    items: [
      { id: "suppliers", label: "Suppliers", href: "/suppliers", perm: "supplier.view" },
      { id: "purchasing", label: "Purchasing", href: "/purchasing", perm: "purchase.view" },
      { id: "items", label: "Item Master", href: "/items", perm: "item.view" },
      { id: "stock", label: "Warehouse Stock", href: "/stock", perm: "stock.view" },
      { id: "holdings", label: "Holdings & Handover", href: "/holdings" },
      { id: "pricing", label: "Rate Master", href: "/pricing", perm: "pricing.manage" },
    ],
  },
  {
    label: "Manufacturing",
    items: [
      { id: "bom", label: "BOM / Recipes", href: "/bom", perm: "bom.view" },
      { id: "production", label: "Production Runs", href: "/production", perm: "production.run" },
      { id: "production-jobs", label: "Jobs", href: "/production/jobs", perm: "production.run" },
      { id: "costing", label: "Process Costing", href: "/costing", perm: "report.view_all" },
    ],
  },
  {
    label: "Accounting",
    items: [
      { id: "journal", label: "Journal", href: "/journal", perm: "journal.view" },
      { id: "vouchers", label: "Manual Vouchers", href: "/vouchers", perm: "journal.post" },
      { id: "expenses", label: "Expenses & Petty Cash", href: "/expenses", perm: "accounting.manage" },
      { id: "assets", label: "Fixed Assets", href: "/assets", perm: "accounting.manage" },
      { id: "loans", label: "Loans & EMI", href: "/loans", perm: "accounting.manage" },
      { id: "gst", label: "GST Reports", href: "/gst", perm: "report.view_all" },
      { id: "trialbalance", label: "Trial Balance", href: "/trial-balance", perm: "report.view_all" },
      { id: "reports", label: "P&L / Balance Sheet", href: "/reports", perm: "report.view_all" },
      { id: "bank", label: "Bank Reconciliation", href: "/bank", perm: "bank.reconcile" },
      { id: "documents", label: "Documents", href: "/documents" },
    ],
  },
  {
    label: "Field & People",
    items: [
      { id: "routes", label: "Routes & Visits", href: "/routes", perm: "field.view" },
      { id: "fleet", label: "Vehicles & Fuel", href: "/fleet", perm: "field.view" },
      { id: "crm", label: "CRM & Complaints", href: "/crm", perm: "crm.view" },
      { id: "commissions", label: "Targets & Commissions", href: "/commissions", perm: "commission.view" },
      { id: "payroll", label: "Attendance & Payroll", href: "/payroll", perm: "hr.view" },
    ],
  },
  {
    label: "Admin",
    items: [
      { id: "users", label: "Users & Access", href: "/admin/users", perm: "roles.manage" },
      { id: "audit", label: "Audit Log", href: "/admin/audit", perm: "audit.view" },
      { id: "licenses", label: "Licence Register", href: "/admin/licenses", perm: "license.view", badgeKey: "licensesDue" },
      { id: "settings", label: "Company Settings", href: "/admin/settings", perm: "settings.manage" },
      { id: "whatsapp", label: "WhatsApp Settings", href: "/admin/whatsapp", perm: "settings.manage" },
      { id: "whatsapp-worker", label: "WhatsApp Worker", href: "/admin/whatsapp/worker", perm: "settings.manage" },
      { id: "production-devices", label: "Production Devices", href: "/admin/production-devices", perm: "settings.manage" },
    ],
  },
];
