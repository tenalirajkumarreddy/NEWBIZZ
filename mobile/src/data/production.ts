import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { rpc } from "@/lib/rpc";
import { qk } from "./keys";

export type JobCardStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface JobCardRow {
  id: string;
  jobNo: string;
  cardDate: string;
  stage: number; // 1 = Blowing, 2 = Filling
  outputItemId: string;
  outputName: string;
  outputSku: string;
  targetQty: number;
  deviceLabel: string | null;
  assignedToName: string | null;
  plannedStartAt: string | null;
  instructions: string | null;
  status: JobCardStatus;
  runNo: string | null;
  createdAt: string;
}

const SELECT =
  "id, job_no, card_date, stage, output_item_id, target_qty, planned_start_at, instructions, status, run_id, created_at, " +
  "output_item:items!production_job_cards_output_item_id_fkey(sku, name), " +
  "device:production_device_config!production_job_cards_device_id_fkey(device_id), " +
  "assignee:users!production_job_cards_assigned_to_fkey(full_name), " +
  "run:production_runs!production_job_cards_run_id_fkey(run_no)";

/** Production job cards, newest dates first. */
export function useJobCards() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.jobCards(),
    enabled: !!user?.id,
    queryFn: async (): Promise<JobCardRow[]> => {
      const { data, error } = await supabase
        .from("production_job_cards")
        .select(SELECT)
        .order("card_date", { ascending: false })
        .order("job_no", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        jobNo: r.job_no,
        cardDate: r.card_date,
        stage: Number(r.stage),
        outputItemId: r.output_item_id,
        outputName: r.output_item?.name ?? "Item",
        outputSku: r.output_item?.sku ?? "",
        targetQty: Number(r.target_qty ?? 0),
        deviceLabel: (r.device?.device_id as string) ?? null,
        assignedToName: (r.assignee?.full_name as string) ?? null,
        plannedStartAt: r.planned_start_at as string | null,
        instructions: r.instructions as string | null,
        status: r.status as JobCardStatus,
        runNo: (r.run?.run_no as string) ?? null,
        createdAt: r.created_at as string,
      }));
    },
  });
}

export interface StageRow {
  id: string;
  name: string;
  unit: string;
}

/** Sellable/finished items for standalone run output selection. */
export function useOutputItems() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["outputItems"],
    enabled: !!user?.id,
    queryFn: async (): Promise<StageRow[]> => {
      const { data, error } = await supabase
        .from("items")
        .select("id, name, base_unit:units!items_base_unit_id_fkey(code)")
        .eq("status", "active")
        .in("type", ["finished_good", "wip"])
        .order("name")
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        name: r.name as string,
        unit: (r.base_unit?.code as string) ?? "",
      }));
    },
  });
}

/**
 * Post a production run. stage: 1 = Blowing, 2 = Filling.
 * Server handles stock moves, costing and journals.
 */
export async function postProductionRun(input: {
  outputItemId: string;
  outputQty: number;
  stage: 1 | 2;
  runDate?: string;
  abnormalWastageValue?: number | null;
  notes?: string | null;
}): Promise<string> {
  const header: Record<string, string> = {
    output_item_id: input.outputItemId,
    output_qty: String(input.outputQty),
    stage: String(input.stage),
  };
  if (input.runDate) header.run_date = input.runDate;
  if (input.abnormalWastageValue && input.abnormalWastageValue > 0)
    header.abnormal_wastage_value = String(input.abnormalWastageValue);
  if (input.notes?.trim()) header.notes = input.notes.trim();
  return rpc<string>("post_production_run", { p_header: header });
}

export async function setJobCardStatus(id: string, status: string, runId?: string): Promise<void> {
  await rpc("set_job_card_status", runId ? { p_id: id, p_status: status, p_run_id: runId } : { p_id: id, p_status: status });
}

export interface StockLevelRow {
  itemId: string;
  itemName: string;
  itemSku: string;
  unit: string;
  qtyOnHand: number;
  reorderLevel: number;
}

/** Current stock on hand (all branches aggregated client-side is avoided:
 * the stock table is per-branch; we show each row with its branch). */
export function useStockLevels() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.stockLevels(),
    enabled: !!user?.id,
    queryFn: async (): Promise<(StockLevelRow & { branchName: string })[]> => {
      const { data, error } = await supabase
        .from("stock")
        .select(
          "item_id, qty_on_hand, " +
            "item:items(sku, name, reorder_level, base_unit:units!items_base_unit_id_fkey(code)), " +
            "branch:branches(name)",
        )
        .order("item_id")
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        itemId: r.item_id,
        itemName: r.item?.name ?? "-",
        itemSku: r.item?.sku ?? "",
        unit: (r.item?.base_unit?.code as string) ?? "",
        qtyOnHand: Number(r.qty_on_hand ?? 0),
        reorderLevel: Number(r.item?.reorder_level ?? 0),
        branchName: (r.branch?.name as string) ?? "-",
      }));
    },
  });
}
