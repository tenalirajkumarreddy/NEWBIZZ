"use server";

// =====================================================================
// lib/actions/bom.ts — Server Actions for BOM / Recipes (§6.1).
//
// BOMs are master data — no ledger/stock impact.
// Writes go through the upsert_bom SECURITY DEFINER RPC (already in 0017)
// or direct INSERT for alternate groups. Permissions (bom.manage)
// are enforced in the DB via RLS.
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { ActionResult } from "./sales";

const PATHS = ["/bom", "/items"];

// ----------------------------------------------------- BOM CRUD

export interface BomLineInput {
  childItemId?: string;
  alternateGroupId?: string;
  quantityPer: number;
  scrapPercent?: number;
}

export interface CreateBomInput {
  parentItemId: string;
  stage?: number;
  outputQty?: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  notes?: string;
  lines: BomLineInput[];
}

export async function createBom(
  input: CreateBomInput,
): Promise<ActionResult<{ bomId: string }>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const lines = (input.lines ?? []).filter(
    (l) => (l.childItemId || l.alternateGroupId) && l.quantityPer > 0,
  );
  if (lines.length === 0)
    return { ok: false, error: "Add at least one component line." };
  const seen = new Set<string>();
  for (const l of lines) {
    const key = l.childItemId ?? l.alternateGroupId;
    if (key && seen.has(key))
      return { ok: false, error: "Duplicate component — merge the lines." };
    if (key) seen.add(key);
  }

  const header: Record<string, Json> = {
    parent_item_id: input.parentItemId,
  };
  if (input.stage != null) header.stage = input.stage;
  if (input.outputQty != null) header.output_qty = input.outputQty;
  if (input.effectiveFrom) header.effective_from = input.effectiveFrom;
  if (input.effectiveTo) header.effective_to = input.effectiveTo;
  if (input.notes) header.notes = input.notes;

  const res = await supabase.rpc("upsert_bom", {
    p_header: header,
    p_lines: lines.map((l) => ({
      ...(l.childItemId ? { child_item_id: l.childItemId } : {}),
      ...(l.alternateGroupId ? { alternate_group_id: l.alternateGroupId } : {}),
      quantity_per: l.quantityPer,
      ...(l.scrapPercent != null ? { scrap_percent: l.scrapPercent } : {}),
    })),
  });

  if (res.error || res.data == null) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:createBom]", msg);
    return {
      ok: false,
      error: msg || "The BOM could not be created.",
    };
  }
  PATHS.forEach((p) => revalidatePath(p));
  return { ok: true, bomId: res.data as string };
}

export async function closeBom(
  id: string,
  effectiveTo: string,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing BOM ID." };
  if (!effectiveTo) return { ok: false, error: "Provide an effective-to date." };
  const supabase = createClient();
  const res = await supabase
    .from("boms")
    .update({ effective_to: effectiveTo } as never)
    .eq("id", id);
  if (res.error) {
    console.error("[action:closeBom]", res.error.message);
    return { ok: false, error: res.error.message };
  }
  PATHS.forEach((p) => revalidatePath(p));
  return { ok: true };
}

// ----------------------------------------------------- Alternate Groups

export async function createAlternateGroup(
  input: { name: string; notes?: string },
): Promise<ActionResult<{ groupId: string }>> {
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Group name is required." };
  const supabase = createClient();
  const res = await supabase
    .from("alternate_groups")
    .insert({ name, notes: input.notes ?? null } as never)
    .select("id")
    .maybeSingle();
  if (res.error) {
    const msg = res.error.message.includes("duplicate")
      ? "A group with this name already exists."
      : res.error.message;
    console.error("[action:createAltGroup]", msg);
    return { ok: false, error: msg };
  }
  PATHS.forEach((p) => revalidatePath(p));
  revalidatePath("/bom/alternate-groups");
  return { ok: true, groupId: res.data!.id };
}

export async function upsertAlternateGroupMember(
  groupId: string,
  input: { itemId: string; priority?: number; isDefault?: boolean },
): Promise<ActionResult> {
  if (!groupId || !input.itemId)
    return { ok: false, error: "Group and item are required." };
  const supabase = createClient();
  const { error } = await supabase.from("alternate_group_members").upsert(
    {
      group_id: groupId,
      item_id: input.itemId,
      priority: input.priority ?? 1,
      is_default: input.isDefault ?? false,
    } as never,
    { onConflict: "group_id, item_id" },
  );
  if (error) {
    console.error("[action:upsertAltMember]", error.message);
    return { ok: false, error: error.message };
  }
  PATHS.forEach((p) => revalidatePath(p));
  revalidatePath(`/bom/alternate-groups/${groupId}`);
  return { ok: true };
}

export async function removeAlternateGroupMember(
  groupId: string,
  itemId: string,
): Promise<ActionResult> {
  if (!groupId || !itemId)
    return { ok: false, error: "Group and item are required." };
  const supabase = createClient();
  const { error } = await supabase
    .from("alternate_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("item_id", itemId);
  if (error) {
    console.error("[action:removeAltMember]", error.message);
    return { ok: false, error: error.message };
  }
  PATHS.forEach((p) => revalidatePath(p));
  revalidatePath(`/bom/alternate-groups/${groupId}`);
  return { ok: true };
}
