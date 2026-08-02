// Shared licence types + labels. Kept free of `server-only` so both server
// readers (lib/data/licenses.ts) and client pages can import them.

export type LicenseType = "fssai" | "bis_isi" | "pcb_consent" | "trade_license" | "legal_metrology" | "other";
export type LicenseStatus = "active" | "expired" | "renewal_in_progress";

export interface LicenseRow {
  id: string;
  type: LicenseType;
  licenseNo: string;
  status: LicenseStatus;
  issuedDate: string | null;
  expiryDate: string;
  issuingAuthority: string | null;
  renewalReminderDays: number;
  notes: string | null;
  documentUrl: string | null;
  daysToExpiry: number;
}

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  fssai: "FSSAI",
  bis_isi: "BIS / ISI",
  pcb_consent: "PCB Consent",
  trade_license: "Trade Licence",
  legal_metrology: "Legal Metrology",
  other: "Other",
};
