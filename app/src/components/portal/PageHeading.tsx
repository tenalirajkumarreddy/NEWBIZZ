export function PageHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <p className="eyebrow text-brand">{eyebrow}</p>
      <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>}
    </div>
  );
}