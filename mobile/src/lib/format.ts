// Money & date formatting — IST everywhere, en-IN grouping (DESIGN.md §7).
const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function moneyINR(n: number): string {
  return `₹${inr.format(Number.isFinite(n) ? n : 0)}`;
}

export function moneyCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${compact.format(Math.round((n / 1_00_00_000) * 100) / 100)}Cr`;
  if (abs >= 1_00_000) return `₹${compact.format(Math.round((n / 1_00_000) * 100) / 100)}L`;
  if (abs >= 1000) return `₹${plain.format(n)}`;
  return `₹${plain.format(n)}`;
}

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function dateIST(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

export function timeAgoIST(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return dateIST(iso);
}
