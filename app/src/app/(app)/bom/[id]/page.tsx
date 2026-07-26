import Link from "next/link";
import { notFound } from "next/navigation";
import { getBom } from "@/lib/data/bom";
import { Panel, Card, SectionHeading } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { CloseBomButton } from "./CloseBomButton";

export const metadata = { title: "BOM Detail — NEWBIZZ" };

export default async function BomDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const bom = await getBom(id);
  if (!bom) notFound();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/bom" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← BOM / Recipes
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">
          {bom.parentSku} — {bom.parentName}
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Stage {bom.stage} · <StatusBadge status={bom.status} size="sm" />
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/bom/${id}/edit`}>
          <Button variant="secondary" size="sm">Edit</Button>
        </Link>
        <Link href={`/bom/${id}/clone`}>
          <Button variant="secondary" size="sm">Clone</Button>
        </Link>
        <Link href={`/bom/where-used?itemId=${bom.parentItemId}`}>
          <Button variant="ghost" size="sm">Where used</Button>
        </Link>
        {bom.status === "active" && <CloseBomButton bomId={id} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <SectionHeading className="mb-1">Effective From</SectionHeading>
          <p className="text-[13px] font-semibold text-ink">{bom.effectiveFrom}</p>
        </Card>
        <Card className="p-4">
          <SectionHeading className="mb-1">Effective To</SectionHeading>
          <p className="text-[13px] font-semibold text-ink">
            {bom.effectiveTo ?? "Open-ended"}
          </p>
        </Card>
        <Card className="p-4">
          <SectionHeading className="mb-1">Output Quantity</SectionHeading>
          <p className="text-[13px] font-semibold text-ink">{bom.outputQty}</p>
        </Card>
      </div>

      <Panel title={`Components (${bom.lines.length})`} flush>
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Item / Alternative Group</TH>
              <TH numeric>Quantity per</TH>
              <TH numeric>Scrap %</TH>
              <TH>Type</TH>
            </TR>
          </THead>
          <TBody>
            {bom.lines.map((line, i) => (
              <TR key={line.id}>
                <TD className="text-[11px] text-ink-4">{i + 1}</TD>
                <TD>
                  {line.childItemId ? (
                    <Link
                      href={`/items/${line.childItemId}`}
                      className="font-medium text-brand hover:underline"
                    >
                      <span className="font-mono text-[12px]">{line.childSku}</span>{" "}
                      <span className="text-ink">{line.childName}</span>
                    </Link>
                  ) : line.alternateGroupId ? (
                    <Link
                      href={`/bom/alternate-groups/${line.alternateGroupId}`}
                      className="text-brand hover:underline"
                    >
                      <span className="font-medium">{line.alternateGroupName ?? "Alt group"}</span>
                      <span className="ml-1 text-[11px] text-ink-3">(alternate group)</span>
                    </Link>
                  ) : (
                    <span className="text-ink-4">—</span>
                  )}
                </TD>
                <TD numeric className="font-mono tnum">{line.quantityPer}</TD>
                <TD numeric className="font-mono tnum">
                  {line.scrapPercent != null ? `${line.scrapPercent}%` : "—"}
                </TD>
                <TD>
                  <Badge tone="slate" size="sm">
                    {line.childItemId ? "Item" : "Alt group"}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Panel>

      {bom.notes && (
        <Panel title="Notes">
          <p className="text-[13px] leading-relaxed text-ink-2 whitespace-pre-wrap">{bom.notes}</p>
        </Panel>
      )}
    </div>
  );
}
