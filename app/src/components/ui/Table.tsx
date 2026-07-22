import { cn } from "@/lib/cn";

// Table — a thin, composable wrapper over native table elements so ledgers,
// registers and lists share one look: sticky slate header, hairline rows,
// hover tint, right-aligned monospace numerics. Compose directly:
//
//   <Table>
//     <THead>
//       <TR><TH>Item</TH><TH numeric>Qty</TH><TH numeric>Amount</TH></TR>
//     </THead>
//     <TBody>
//       {rows.map(r => (
//         <TR key={r.id} interactive onClick={...}>
//           <TD>{r.name}</TD>
//           <TD numeric>{qty(r.qty)}</TD>
//           <TD numeric>{money(r.amount)}</TD>
//         </TR>
//       ))}
//     </TBody>
//   </Table>

export function Table({ className, ...rest }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px]", className)} {...rest} />
    </div>
  );
}

export function THead({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("sticky top-0 z-10 bg-fill text-ink-3", className)}
      {...rest}
    />
  );
}

export function TBody({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...rest} />;
}

export interface TRProps extends React.HTMLAttributes<HTMLTableRowElement> {
  interactive?: boolean;
  selected?: boolean;
}

export function TR({ interactive, selected, className, ...rest }: TRProps) {
  return (
    <tr
      className={cn(
        interactive && "cursor-pointer transition-colors hover:bg-fill",
        selected && "bg-brand-wash",
        className,
      )}
      {...rest}
    />
  );
}

export interface CellProps {
  numeric?: boolean;
  className?: string;
}

export function TH({
  numeric,
  className,
  children,
  ...rest
}: CellProps & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-line px-3 py-2 text-left align-middle text-[11px] font-semibold uppercase tracking-wide",
        numeric && "text-right tabular-nums",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({
  numeric,
  className,
  children,
  ...rest
}: CellProps & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle text-ink-2",
        numeric && "text-right font-mono tnum text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}
