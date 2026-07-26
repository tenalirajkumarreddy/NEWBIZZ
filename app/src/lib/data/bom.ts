// =====================================================================
// lib/data/bom.ts — server-only readers for BOM / Recipes (§6.1).
//
// BOMs, alternate groups, explosion, standard cost.
// All reads are RLS-scoped under the caller's JWT. No writes here —
// mutations go through lib/actions/bom.ts.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

// --------------------------------------------------------- BOM list

export interface BomListRow {
  id: string;
  parentItemId: string;
  parentSku: string;
  parentName: string;
  stage: number;
  outputQty: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  lineCount: number;
  status: string;
  createdBy: string;
  createdAt: string;
}

type RawBomList = {
  id: string;
  parent_item_id: string;
  stage: number;
  output_qty: number;
  effective_from: string;
  effective_to: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  parent: { sku: string; name: string } | null;
  creator: { full_name: string } | null;
  lines: { count: number }[];
};

const BOM_LIST_SELECT =
  "id, parent_item_id, stage, output_qty, effective_from, effective_to, status, created_by, created_at, " +
  "parent:items!boms_parent_item_id_fkey(sku, name), " +
  "creator:users!boms_created_by_fkey(full_name), " +
  "lines:bom_lines(count)";

export async function listBoms(opts: {
  status?: string;
  parentItemId?: string;
} = {}): Promise<BomListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("boms")
    .select(BOM_LIST_SELECT)
    .order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.parentItemId) q = q.eq("parent_item_id", opts.parentItemId);

  const rows = unwrap(await q.returns<RawBomList[]>(), [] as RawBomList[], "listBoms");
  return rows.map((r) => ({
    id: r.id,
    parentItemId: r.parent_item_id,
    parentSku: r.parent?.sku ?? "—",
    parentName: r.parent?.name ?? "—",
    stage: r.stage,
    outputQty: Number(r.output_qty),
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    lineCount: r.lines?.[0]?.count ?? 0,
    status: r.status,
    createdBy: r.creator?.full_name ?? "—",
    createdAt: r.created_at,
  }));
}

// --------------------------------------------------------- BOM detail

export interface BomLineDetail {
  id: string;
  lineNo: number;
  childItemId: string | null;
  childSku: string | null;
  childName: string | null;
  alternateGroupId: string | null;
  alternateGroupName: string | null;
  quantityPer: number;
  scrapPercent: number;
}

export interface BomDetail {
  id: string;
  parentItemId: string;
  parentSku: string;
  parentName: string;
  stage: number;
  outputQty: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  status: string;
  lines: BomLineDetail[];
  createdBy: string;
  createdAt: string;
}

type RawBomLine = {
  id: string;
  line_no: number;
  child_item_id: string | null;
  alternate_group_id: string | null;
  quantity_per: number;
  scrap_percent: number;
  child: { sku: string; name: string } | null;
  alt_group: { name: string } | null;
};

type RawBomDetail = {
  id: string;
  parent_item_id: string;
  stage: number;
  output_qty: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  parent: { sku: string; name: string } | null;
  creator: { full_name: string } | null;
};

const BOM_DETAIL_SELECT =
  "id, parent_item_id, stage, output_qty, effective_from, effective_to, notes, status, created_by, created_at, " +
  "parent:items!boms_parent_item_id_fkey(sku, name), " +
  "creator:users!boms_created_by_fkey(full_name)";

const BOM_LINE_SELECT =
  "id, line_no, child_item_id, alternate_group_id, quantity_per, scrap_percent, " +
  "child:items!bom_lines_child_item_id_fkey(sku, name), " +
  "alt_group:alternate_groups!bom_lines_alternate_group_id_fkey(name)";

export async function getBom(id: string): Promise<BomDetail | null> {
  const supabase = createClient();
  const [hdrRes, linesRes] = await Promise.all([
    supabase
      .from("boms")
      .select(BOM_DETAIL_SELECT)
      .eq("id", id)
      .maybeSingle()
      .returns<RawBomDetail | null>(),
    supabase
      .from("bom_lines")
      .select(BOM_LINE_SELECT)
      .eq("bom_id", id)
      .order("line_no")
      .returns<RawBomLine[]>(),
  ]);
  const hdr = unwrap(hdrRes, null as RawBomDetail | null, "getBom");
  if (!hdr) return null;
  const lines = unwrap(linesRes, [] as RawBomLine[], "getBom:lines");
  return {
    id: hdr.id,
    parentItemId: hdr.parent_item_id,
    parentSku: hdr.parent?.sku ?? "—",
    parentName: hdr.parent?.name ?? "—",
    stage: hdr.stage,
    outputQty: Number(hdr.output_qty),
    effectiveFrom: hdr.effective_from,
    effectiveTo: hdr.effective_to,
    notes: hdr.notes,
    status: hdr.status,
    lines: lines.map((l) => ({
      id: l.id,
      lineNo: l.line_no,
      childItemId: l.child_item_id,
      childSku: l.child?.sku ?? null,
      childName: l.child?.name ?? null,
      alternateGroupId: l.alternate_group_id,
      alternateGroupName: l.alt_group?.name ?? null,
      quantityPer: Number(l.quantity_per),
      scrapPercent: Number(l.scrap_percent),
    })),
    createdBy: hdr.creator?.full_name ?? "—",
    createdAt: hdr.created_at,
  };
}

export async function getBomForItem(
  itemId: string,
  asOf?: string,
): Promise<BomDetail | null> {
  const supabase = createClient();
  const bomId = await supabase.rpc("active_bom_for", {
    p_item: itemId,
    p_as_of: asOf ?? undefined,
  });
  if (bomId.error || !bomId.data) return null;
  return getBom(bomId.data);
}

// --------------------------------------------------------- Alternate groups

export interface AlternateGroupMemberRow {
  id: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  priority: number;
  isDefault: boolean;
}

export interface AlternateGroupRow {
  id: string;
  name: string;
  notes: string | null;
  members: AlternateGroupMemberRow[];
}

type RawAltGroup = {
  id: string;
  name: string;
  notes: string | null;
};

type RawAltMember = {
  id: string;
  item_id: string;
  priority: number;
  is_default: boolean;
  item: { sku: string; name: string } | null;
};

export async function listAlternateGroups(): Promise<AlternateGroupRow[]> {
  const supabase = createClient();
  const [grpRes, memRes] = await Promise.all([
    supabase
      .from("alternate_groups")
      .select("id, name, notes")
      .order("name")
      .returns<RawAltGroup[]>(),
    supabase
      .from("alternate_group_members")
      .select("id, group_id, item_id, priority, is_default, item:items(sku, name)")
      .order("priority")
      .returns<(RawAltMember & { group_id: string })[]>(),
  ]);
  const groups = unwrap(grpRes, [] as RawAltGroup[], "listAltGroups");
  const members = unwrap(memRes, [] as (RawAltMember & { group_id: string })[], "listAltGroups:members");
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    notes: g.notes,
    members: members
      .filter((m) => m.group_id === g.id)
      .map((m) => ({
        id: m.id,
        itemId: m.item_id,
        itemSku: m.item?.sku ?? "—",
        itemName: m.item?.name ?? "—",
        priority: m.priority,
        isDefault: m.is_default,
      })),
  }));
}

export async function getAlternateGroup(id: string): Promise<AlternateGroupRow | null> {
  const supabase = createClient();
  const [grpRes, memRes] = await Promise.all([
    supabase
      .from("alternate_groups")
      .select("id, name, notes")
      .eq("id", id)
      .maybeSingle()
      .returns<RawAltGroup | null>(),
    supabase
      .from("alternate_group_members")
      .select("id, item_id, priority, is_default, item:items(sku, name)")
      .eq("group_id", id)
      .order("priority")
      .returns<RawAltMember[]>(),
  ]);
  const grp = unwrap(grpRes, null as RawAltGroup | null, "getAltGroup");
  if (!grp) return null;
  const members = unwrap(memRes, [] as RawAltMember[], "getAltGroup:members");
  return {
    id: grp.id,
    name: grp.name,
    notes: grp.notes,
    members: members.map((m) => ({
      id: m.id,
      itemId: m.item_id,
      itemSku: m.item?.sku ?? "—",
      itemName: m.item?.name ?? "—",
      priority: m.priority,
      isDefault: m.is_default,
    })),
  };
}

// --------------------------------------------------------- RPC wrappers

export interface BomExplosionRow {
  childItemId: string;
  childSku: string;
  childName: string;
  grossQty: number;
}

const EXPLOSION_ITEM_SELECT =
  "id, sku, name";

export async function explodeBom(
  itemId: string,
  outputUnits?: number,
  asOf?: string,
): Promise<BomExplosionRow[]> {
  const supabase = createClient();
  const res = await supabase.rpc("explode_bom", {
    p_item: itemId,
    p_output_units: outputUnits ?? 1,
    p_as_of: asOf ?? undefined,
  });
  const rows = (res.data as { child_item_id: string; gross_qty: number }[] | null) ?? [];
  if (rows.length === 0) return [];
  // Fetch item details for the exploded children
  const childIds = rows.map((r) => r.child_item_id);
  const itemRes = await supabase
    .from("items")
    .select(EXPLOSION_ITEM_SELECT)
    .in("id", childIds)
    .returns<{ id: string; sku: string; name: string }[]>();
  const items = new Map(
    (itemRes.data ?? []).map((i) => [i.id, i]),
  );
  return rows.map((r) => ({
    childItemId: r.child_item_id,
    childSku: items.get(r.child_item_id)?.sku ?? "—",
    childName: items.get(r.child_item_id)?.name ?? "—",
    grossQty: Number(r.gross_qty),
  }));
}

export interface WhereUsedRow {
  bomId: string;
  parentItemId: string;
  parentSku: string;
  parentName: string;
  stage: number;
  quantityPer: number;
  effectiveFrom: string;
  status: string;
}

export async function whereUsed(id: string): Promise<WhereUsedRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("bom_lines")
      .select("bom_id, quantity_per, bom:boms!bom_lines_bom_id_fkey(parent_item_id, stage, effective_from, status, parent:items!boms_parent_item_id_fkey(sku, name))")
      .or(`child_item_id.eq.${id},alternate_group_id.eq.${id}`)
      .returns<{
        bom_id: string;
        quantity_per: number;
        bom: {
          parent_item_id: string;
          stage: number;
          effective_from: string;
          status: string;
          parent: { sku: string; name: string } | null;
        } | null;
      }[]>(),
    [],
    "whereUsed",
  );
  return rows
    .filter((r) => r.bom)
    .map((r) => ({
      bomId: r.bom_id,
      parentItemId: r.bom!.parent_item_id,
      parentSku: r.bom!.parent?.sku ?? "—",
      parentName: r.bom!.parent?.name ?? "—",
      stage: r.bom!.stage,
      quantityPer: Number(r.quantity_per),
      effectiveFrom: r.bom!.effective_from,
      status: r.bom!.status,
    }));
}

export async function bomStandardCost(
  itemId: string,
  outputUnits?: number,
  asOf?: string,
): Promise<number> {
  const supabase = createClient();
  const res = await supabase.rpc("bom_standard_cost", {
    p_item: itemId,
    p_output_units: outputUnits ?? 1,
    p_as_of: asOf ?? undefined,
  });
  if (res.error) {
    console.error("[data:bomStandardCost]", res.error.message);
    return 0;
  }
  return Number(res.data ?? 0);
}
