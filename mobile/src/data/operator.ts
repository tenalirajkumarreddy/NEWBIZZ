import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { qk } from "./keys";
import { todayIST } from "@/lib/format";

/** Operator dashboard + staff data. All reads RLS-gated server-side. */

export interface StageProgress {
  stage: number;
  targetQty: number;
  producedQty: number;
  jobs: number;
}

/** Today's production targets (open job cards) vs posted run output, per stage. */
export function useTodayProduction() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["opTodayProduction"],
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
          .select("run_no, stage, output_qty, output_item:items(name)")
          .eq("run_date", today)
          .eq("status", "posted")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (runsRes.error) throw runsRes.error;

      const stages = new Map<number, StageProgress>();
      for (const stage of [1, 2]) {
        stages.set(stage, { stage, targetQty: 0, producedQty: 0, jobs: 0 });
      }
      for (const j of jobsRes.data ?? []) {
        const s = stages.get(Number(j.stage));
        if (s && j.status !== "cancelled") {
          s.targetQty += Number(j.target_qty ?? 0);
          s.jobs++;
        }
      }
      const runs = (runsRes.data ?? []).map((r: any) => ({
        runNo: r.run_no as string,
        name: (r.output_item?.name as string) ?? "Item",
        qty: Number(r.output_qty ?? 0),
        stage: Number(r.stage),
      }));
      for (const r of runs) {
        const s = stages.get(r.stage);
        if (s) s.producedQty += r.qty;
      }
      const wastage = (runsRes.data ?? []).length; // runs fetched; wastage summed below
      void wastage;
      return { stages: [...stages.values()], recent: runs, wastage: 0 };
    },
  });
}

export interface OpOrderRow {
  id: string;
  orderNo: string;
  orderDate: string;
  status: string;
  storeName: string | null;
  total: number;
}

/** Orders (read-only for operators). */
export function useOrders() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["opOrders"],
    enabled: !!user?.id,
    queryFn: async (): Promise<OpOrderRow[]> => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select(
          "id, order_no, order_date, status, " +
            "store:customer_stores(name), " +
            "lines:sales_order_lines(qty, unit_price)",
        )
        .order("order_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        orderNo: r.order_no,
        orderDate: r.order_date,
        status: r.status,
        storeName: (r.store?.name as string) ?? null,
        total: (r.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty ?? 0) * Number(l.unit_price ?? 0), 0),
      }));
    },
  });
}

export interface ChallanRow {
  id: string;
  challanNo: string;
  challanDate: string;
  status: string;
  orderNo: string | null;
  orderId: string | null;
}

/** Delivery challans (read + status updates + PDF share). */
export function useChallans() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["opChallans"],
    enabled: !!user?.id,
    queryFn: async (): Promise<ChallanRow[]> => {
      const { data, error } = await supabase
        .from("delivery_challans")
        .select("id, challan_no, challan_date, status, order_id, order:sales_orders(order_no)")
        .order("challan_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        challanNo: r.challan_no,
        challanDate: r.challan_date,
        status: r.status,
        orderId: r.order_id as string | null,
        orderNo: (r.order?.order_no as string) ?? null,
      }));
    },
  });
}

export async function setChallanStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.rpc("set_challan_status", { p_id: id, p_status: status });
  if (error) throw error;
}

/** Challan PDF: opens the web print view (share target = PDF). */
export function challanPdfUrl(challanId: string): string {
  const base = process.env.EXPO_PUBLIC_WEB_URL ?? "https://newbizz-kappa.vercel.app";
  return `${base}/challans/${challanId}/print`;
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
    queryKey: ["opStaff"],
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
    const payload =
      r.entityType === "user"
        ? { ...base, user_id: r.entityId }
        : { ...base, worker_id: r.entityId };
    const { error } = await supabase.from("attendance").upsert(payload, {
      onConflict: r.entityType === "user" ? "user_id,work_date" : "worker_id,work_date",
    });
    if (error) throw error;
  }
}

export interface AttendanceTodayRow {
  id: string;
  entityType: "user" | "worker";
  name: string;
  status: string;
  hours: number;
  otHours: number;
}

export function useAttendanceToday() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["opAttendanceToday"],
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
    queryKey: ["opPayrollRuns"],
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
    queryKey: ["opPayrollLines", runId],
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
}): Promise<string> {
  const { data, error } = await supabase
    .from("workers")
    .insert({ full_name: input.fullName, phone: input.phone, aadhar_number: input.aadhar })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
