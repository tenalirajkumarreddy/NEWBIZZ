export function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-[13px] first:pt-0 last:pb-0">
      <span className="text-ink-3">{label}</span>
      <span className={`text-right font-semibold text-ink ${mono ? "font-mono tnum" : ""}`}>{value}</span>
    </div>
  );
}
