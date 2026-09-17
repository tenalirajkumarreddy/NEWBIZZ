import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { qk } from "./keys";
import type { Database } from "@/lib/db-types";
import { todayIST } from "@/lib/format";
import { rpc, RpcError } from "@/lib/rpc";
import { isoDaysAgo } from "./transfers";
import {
  aggregateTodayProduction,
  buildStockTransferHeader,
  type StageProgress,
} from "@/lib/opBuilders";
export type { StageProgress };

/** Operator dashboard + staff data. All reads RLS-gated server-side. */

/** Today's production targets (open job cards) vs posted run output, per stage. */
export function useTodayProduction() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.opTodayProduction(),
    enabled: !!user?.id,
    queryFn: async (): Promise<{ stages: StageProgress[]; wastage: number; recent: { runNo: string; name: string; qty: number; stage: number }[] }> => {
      const today = todayIST();
      const [jobsRes, runsRes] = await Promise.all([
        supabase
          .from("production_job_cards")
          .select("stage, target_qty, status")
          .eq("card_date", today),
        supabase
          .from("production_runs")
          .select("run_no, stage, output_qty, abnormal_wastage_value, output_item:items(name)")
          .eq("run_date", today)
          .eq("status", "posted")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (runsRes.error) throw runsRes.error;
      const runs = (runsRes.data ?? []).map((r: any) => ({
        run_no: r.run_no as string,
        item_name: (r.output_item?.name as string) ?? null,
        stage: Number(r.stage),
        output_qty: r.output_qty,
        abnormal_wastage_value: r.abnormal_wastage_value,
      }));
      const { stages, wastage } = aggregateTodayProduction(
        (jobsRes.data ?? []) as any, runs,
      );
      return {
        stages,
        wastage,
        recent: runs
          .map((r) => ({
            runNo: r.run_no,
            name: r.item_name ?? "Item",
            qty: Number(r.output_qty ?? 0),
            stage: r.stage,
          }))
          .slice(0, 8),
      };
    },
  });
}

export interface WorkerRow {
  id: string;
  name: string;
  phone: string | null;
  kind: "user" | "worker";
  status: string | null;
}

/** Staff = user-employees + workers. */
export function useStaff() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.opStaff(),
    enabled: !!user?.id,
    queryFn: async (): Promise<WorkerRow[]> => {
      const [usersRes, workersRes] = await Promise.all([
        supabase.from("users").select("id, full_name, phone, status").order("full_name"),
        supabase.from("workers").select("id, full_name, phone, status").order("full_name"),
      ]);
      if (usersRes.error) throw usersRes.error;
      if (workersRes.error) throw workersRes.error;
      return [
        ...(usersRes.data ?? []).map((u: any) => ({
          id: u.id as string,
          name: u.full_name as string,
          phone: (u.phone as string) ?? null,
          kind: "user" as const,
          status: (u.status as string) ?? null,
        })),
        ...(workersRes.data ?? []).map((w: any) => ({
          id: w.id as string,
          name: w.full_name as string,
          phone: (w.phone as string) ?? null,
          kind: "worker" as const,
          status: (w.status as string) ?? null,
        })),
      ];
    },
  });
}

export interface AttendanceMark {
  entityType: "user" | "worker";
  entityId: string;
  status: "present" | "absent" | "half_day" | "leave" | "holiday" | "week_off";
  hours: number;
  otHours: number;
}

/** Upsert today's attendance rows. Only today is permitted server-side. */
export async function markAttendance(rows: AttendanceMark[]): Promise<void> {
  const date = todayIST();
  for (const r of rows) {
    const base = {
      work_date: date,
      status: r.status,
      hours: r.hours,
      ot_hours: r.otHours,
    };
    const payload: Database["public"]["Tables"]["attendance"]["Insert"] =
      r.entityType === "user"
        ? { ...base, user_id: r.entityId, worker_id: null }
        : { ...base, worker_id: r.entityId, user_id: null };
    const { error } = await supabase.from("attendance").upsert(payload, {
      onConflict: r.entityType === "user" ? "user_id,work_date" : "worker_id,work_date",
    });
    if (error) throw error;
  }
}

export interface AttendanceTodayRow {
  id: string;
  entityType: "user" | "worker";
  entityId: string;
  name: string;
  status: string;
  hours: number;
  otHours: number;
}

export function useAttendanceToday() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.opAttendanceToday(),
    enabled: !!user?.id,
    queryFn: async (): Promise<AttendanceTodayRow[]> => {
      const today = todayIST();
      const { data, error } = await supabase
        .from("attendance")
        .select(
          "id, user_id, worker_id, status, hours, ot_hours, " +
            "u:users!attendance_user_id_fkey(full_name), " +
            "w:workers!attendance_worker_id_fkey(full_name)",
        )
        .eq("work_date", today);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        entityType: r.user_id ? "user" : "worker",
        entityId: (r.user_id ?? r.worker_id) as string,
        name: (r.u?.full_name as string) ?? (r.w?.full_name as string) ?? "—",
        status: r.status as string,
        hours: Number(r.hours ?? 0),
        otHours: Number(r.ot_hours ?? 0),
      }));
    },
  });
}

export interface PayrollRunRow {
  id: string;
  periodMonth: string;
  status: string;
  totalGross: number;
}

export function usePayrollRuns() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.opPayrollRuns(),
    enabled: !!user?.id,
    queryFn: async (): Promise<PayrollRunRow[]> => {
      const { data, error } = await supabase
        .from("payroll_runs")
        .select("id, period_month, status, total_gross")
        .order("period_month", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        periodMonth: r.period_month as string,
        status: r.status as string,
        totalGross: Number(r.total_gross ?? 0),
      }));
    },
  });
}

export interface PayrollLineRow {
  id: string;
  name: string;
  gross: number;
  paid: boolean;
}

export function usePayrollLines(runId: string | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.opPayrollLines(runId ?? ""),
    enabled: !!user?.id && !!runId,
    queryFn: async (): Promise<PayrollLineRow[]> => {
      const { data, error } = await supabase
        .from("payroll_lines")
        .select(
          "id, gross, paid_journal_id, " +
            "u:users!payroll_lines_user_id_fkey(full_name)",
        )
        .eq("run_id", runId!)
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: (r.u?.full_name as string) ?? "—",
        gross: Number(r.gross ?? 0),
        paid: !!r.paid_journal_id,
      }));
    },
  });
}

export async function addWorker(input: {
  fullName: string;
  phone: string | null;
  aadhar: string | null;
  /** Optional until Task 3 wires the address field — keeps the existing caller compiling. */
  address?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from("workers")
    .insert({ full_name: input.fullName, phone: input.phone, aadhar_number: input.aadhar, address: input.address ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export interface RunHistoryRow {
  id: string;
  runNo: string;
  runDate: string;
  stage: number;
  outputQty: number;
  unitCost: number;
  wastage: number;
  status: string;
  notes: string | null;
  createdAt: string;
  itemName: string | null;
  posterName: string | null;
}

function mapRun(r: any): RunHistoryRow {
  return {
    id: r.id as string,
    runNo: r.run_no as string,
    runDate: r.run_date as string,
    stage: Number(r.stage),
    outputQty: Number(r.output_qty ?? 0),
    unitCost: Number(r.output_unit_cost ?? 0),
    wastage: Number(r.abnormal_wastage_value ?? 0),
    status: r.status as string,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    itemName: (r.output_item?.name as string) ?? null,
    posterName: (r.poster?.full_name as string) ?? null,
  };
}

const RUN_SELECT =
  "id, run_no, run_date, stage, output_qty, output_unit_cost, abnormal_wastage_value, status, notes, created_at, " +
  "output_item:items(name), poster:users!production_runs_created_by_fkey(full_name)";

/** Production runs, last N days, newest first (RLS: read_all_auth). */
export function useRunHistory(days = 14) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.opRunHistory(),
    enabled: !!user?.id,
    queryFn: async (): Promise<RunHistoryRow[]> => {
      const { data, error } = await supabase
        .from("production_runs")
        .select(RUN_SELECT)
        .gte("run_date", isoDaysAgo(days - 1))
        .order("run_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map(mapRun);
    },
  });
}

/** Runs posted by the signed-in user (operator Activity segment). */
export function useMyRuns(days = 14) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.myRuns(),
    enabled: !!user?.id,
    queryFn: async (): Promise<RunHistoryRow[]> => {
      const { data, error } = await supabase
        .from("production_runs")
        .select(RUN_SELECT)
        .eq("created_by", user!.id)
        .gte("run_date", isoDaysAgo(days - 1))
        .order("run_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map(mapRun);
    },
  });
}

export interface BranchRow {
  id: string;
  name: string;
  isWarehouse: boolean;
}

/** Branches for the stock-handover source picker. */
export function useBranches() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.branches(),
    enabled: !!user?.id,
    queryFn: async (): Promise<BranchRow[]> => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, is_warehouse")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((b: any) => ({
        id: b.id as string,
        name: b.name as string,
        isWarehouse: !!b.is_warehouse,
      }));
    },
  });
}

/** Warehouse -> user stock handover (RLS: stock.transfer, RPC create_transfer). */
export async function createStockTransfer(input: {
  fromBranchId: string;
  toUserId: string;
  lines: { itemId: string; qty: number }[];
  note?: string | null;
}): Promise<string> {
  const lines = input.lines.filter((l) => l.itemId && Number(l.qty) > 0);
  if (lines.length === 0) throw new RpcError("Add at least one item with a quantity");
  return rpc<string>("create_transfer", {
    p_header: buildStockTransferHeader(input.fromBranchId, input.toUserId, input.note),
    p_lines: lines.map((l) => ({ item_id: l.itemId, qty: Number(l.qty) })),
  });
}
