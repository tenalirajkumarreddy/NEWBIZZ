import Link from "next/link";

const LINKS = [
  { href: "/portal", label: "Overview" },
  { href: "/portal/invoices", label: "Invoices" },
  { href: "/portal/statement", label: "Statement" },
  { href: "/portal/orders", label: "Orders" },
  { href: "/portal/pay", label: "Make a payment" },
];

export function PortalNav() {
  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}