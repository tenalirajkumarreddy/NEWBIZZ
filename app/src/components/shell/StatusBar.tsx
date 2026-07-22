// 36px mono footer — faithful to refer_UI.html .sbar: three sections (left
// status with a green dot, centered build/context text, right live context).
// Values are honest stubs until wired to real session/context providers; we
// avoid the mockup's fictional money figures.
export function StatusBar({
  branchLabel = "Main Plant",
  fyLabel = "FY 2026-27",
}: {
  branchLabel?: string;
  fyLabel?: string;
}) {
  return (
    <footer className="flex items-center justify-between border-t border-line bg-surface px-5 font-mono text-[11px] text-ink-4">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-grn" />
        All systems nominal
      </span>
      <span className="hidden text-center sm:block">
        {branchLabel} · Asia/Kolkata
      </span>
      <span>{fyLabel} · NEWBIZZ</span>
    </footer>
  );
}
