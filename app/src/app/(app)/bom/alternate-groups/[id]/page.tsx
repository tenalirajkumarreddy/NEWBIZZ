import Link from "next/link";
import { notFound } from "next/navigation";
import { getAlternateGroup, whereUsed } from "@/lib/data/bom";
import { Panel, Card, SectionHeading } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { count as fmtCount } from "@/lib/format";
import { AddMemberForm } from "./AddMemberForm";
import { RemoveMemberButton } from "./RemoveMemberButton";

export const metadata = { title: "Alternate Group — NEWBIZZ" };

export default async function AltGroupDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [group, usage] = await Promise.all([
    getAlternateGroup(id),
    whereUsed(id),
  ]);
  if (!group) notFound();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/bom/alternate-groups" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Alternate Groups
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">{group.name}</h1>
        {group.notes && <p className="mt-0.5 text-[13px] text-ink-3">{group.notes}</p>}
      </div>

      <Panel
        title={`Members (${group.members.length})`}
        actions={<AddMemberForm groupId={group.id} />}
        flush
      >
        {group.members.length === 0 ? (
          <div className="p-4 text-center text-[13px] text-ink-4">
            No items in this group yet.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH numeric>Priority</TH>
                <TH>Default</TH>
                <TH className="w-[80px]" />
              </TR>
            </THead>
            <TBody>
              {group.members.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <Link href={`/items/${m.itemId}`} className="font-medium text-brand hover:underline">
                      <span className="font-mono text-[12px]">{m.itemSku}</span>{" "}
                      <span className="text-ink">{m.itemName}</span>
                    </Link>
                  </TD>
                  <TD numeric className="text-[12px] tnum">{m.priority}</TD>
                  <TD>
                    {m.isDefault ? <Badge tone="grn" size="sm">Default</Badge> : "—"}
                  </TD>
                  <TD>
                    <RemoveMemberButton groupId={group.id} itemId={m.itemId} itemName={`${m.itemSku} — ${m.itemName}`} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {usage.length > 0 && (
        <Panel title={`Used in ${fmtCount(usage.length)} BOMs`} flush>
          <Table>
            <THead>
              <TR>
                <TH>Parent Item</TH>
                <TH>Stage</TH>
                <TH>Qty per</TH>
                <TH>Effective</TH>
                <TH className="w-[100px]" />
              </TR>
            </THead>
            <TBody>
              {usage.map((u) => (
                <TR key={u.bomId}>
                  <TD>
                    <Link href={`/bom/${u.bomId}`} className="font-medium text-brand hover:underline">
                      <span className="font-mono text-[12px]">{u.parentSku}</span>{" "}
                      <span className="text-ink">{u.parentName}</span>
                    </Link>
                  </TD>
                  <TD><Badge tone="slate" size="sm">Stage {u.stage}</Badge></TD>
                  <TD numeric className="font-mono tnum">{u.quantityPer}</TD>
                  <TD className="text-[12px] text-ink-3">{u.effectiveFrom}</TD>
                  <TD>
                    <Link href={`/bom/${u.bomId}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
