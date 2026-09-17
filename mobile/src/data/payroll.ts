import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { qk } from "./keys";
import { rpc } from "@/lib/rpc";
import { runningBalances } from "@/lib/opBuilders";

/** Payroll data layer: shifts, bands, roster, day-save RPC. All reads RLS-gated server-side. */

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  totalHours: number;
}

/** Shift templates for the day-save shift picker. */
export function useShiftTemplates() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.payrollShifts(),
    enabled: !!user?.id,
    queryFn: async (): Promise<ShiftTemplate[]> => {
      const { data, error } = await supabase
        .from("shift_templates")
        .select("id, name, start_time, end_time, total_hours")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        name: r.name as string,
        startTime: r.start_time as string,
        endTime: r.end_time as string,
        totalHours: Number(r.total_hours ?? 0),
      }));
    },
  });
}

export interface PayBand {
  id: string;
  hoursMin: number;
  hoursMax: number;
  amount: number;
}

/** Worker pay bands (display only — the save_attendance_day RPC owns money). */
export function usePayMappings() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.payMappings(),
    enabled: !!user?.id,
    queryFn: async (): Promise<PayBand[]> => {
      const { data, error } = await supabase
        .from("pay_mappings")
        .select("id, hours_min, hours_max, amount")
        .order("hours_min");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        hoursMin: Number(r.hours_min ?? 0),
        hoursMax: Number(r.hours_max ?? 0),
        amount: Number(r.amount ?? 0),
      }));
    },
  });
}

export interface PayrollPerson {
  entityType: "user" | "worker";
  entityId: string;
  fullName: string;
  photoUrl: string | null;
  phone: string | null;
  aadharNumber: string | null;
  address: string | null;
}

/** Roster for the attendance sheet (db-types: list_payroll_people Args: never). */
export function usePayrollPeople(enabled = true) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.payrollPeople(),
    enabled: !!user?.id && enabled,
    queryFn: async (): Promise<PayrollPerson[]> => {
      const { data, error } = await supabase.rpc("list_payroll_people");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        entityType: r.entity_type === "user" ? ("user" as const) : ("worker" as const),
        entityId: r.entity_id as string,
        fullName: (r.full_name as string) ?? "—",
        photoUrl: (r.photo_url as string) ?? null,
        phone: (r.phone as string) ?? null,
        aadharNumber: (r.aadhar_number as string) ?? null,
        address: (r.address as string) ?? null,
      }));
    },
  });
}

/** Signed ledger balance per payroll person, keyed by entityId (positive = WH
 * owes the person). get_person_balance per person in 20-batches — the web
 * getWorkersWithBalances pattern. Invalidate alongside attendance/payroll keys. */
export function useWorkerBalances(enabled = true) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.workerBalances(),
    enabled: !!user?.id && enabled,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data: people, error: peopleError } = await supabase.rpc("list_payroll_people");
      if (peopleError) throw peopleError;
      const ids = (people ?? [])
        .map((r) => r.entity_id as string)
        .filter(Boolean);
      const out: Record<string, number> = {};
      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20);
        const results = await Promise.all(
          batch.map(async (id) => {
            const { data, error } = await supabase.rpc("get_person_balance", {
              p_entity_id: id,
            });
            if (error) throw error;
            return { id, balance: Number(data ?? 0) };
          }),
        );
        for (const r of results) out[r.id] = r.balance;
      }
      return out;
    },
  });
}

/** Monthly salary + OT rate per user id (typed user_pay_config table). */
export function useUserDailyRates() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.dailyRates(),
    enabled: !!user?.id,
    queryFn: async (): Promise<Record<string, { monthlySalary: number | null; otRate: number | null }>> => {
      const { data, error } = await supabase
        .from("user_pay_config")
        .select("user_id, monthly_salary, ot_hourly_rate");
      if (error) throw error;
      const out: Record<string, { monthlySalary: number | null; otRate: number | null }> = {};
      for (const r of data ?? []) {
        if (!r.user_id) continue;
        out[r.user_id] = {
          monthlySalary: r.monthly_salary ?? null,
          otRate: r.ot_hourly_rate ?? null,
        };
      }
      return out;
    },
  });
}

export interface AttendanceDayRow {
  id: string;
  entityType: "user" | "worker";
  entityId: string;
  name: string;
  status: string;
  hours: number;
  otHours: number;
}

/** Attendance rows for one work_date, joined with names via the same FK
 * embeds as useAttendanceToday. Null date disables the query. */
export function useAttendanceForDate(dateISO: string | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.attendanceDay(dateISO ?? ""),
    enabled: !!user?.id && !!dateISO,
    queryFn: async (): Promise<AttendanceDayRow[]> => {
      const { data, error } = await supabase
        .from("attendance")
        .select(
          "id, user_id, worker_id, status, hours, ot_hours, " +
            "u:users!attendance_user_id_fkey(full_name), " +
            "w:workers!attendance_worker_id_fkey(full_name)",
        )
        .eq("work_date", dateISO!);
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

export interface AttendanceHistoryRow {
  dateISO: string;
  status: string;
  hours: number;
  otHours: number;
  shift: string | null;
  note: string | null;
}

/** Last N attendance rows for one entity, newest first (WorkerSheet section).
 * db-types attendance Row: work_date, status, hours, ot_hours, shift, note,
 * user_id, worker_id. */
export function useAttendanceHistory(
  entityType: "user" | "worker",
  entityId: string | null,
  limit = 30,
) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.workerAttendance(entityType, entityId ?? "", limit),
    enabled: !!user?.id && !!entityId,
    queryFn: async (): Promise<AttendanceHistoryRow[]> => {
      const base = supabase
        .from("attendance")
        .select("work_date, status, hours, ot_hours, shift, note");
      const filtered =
        entityType === "user"
          ? base.eq("user_id", entityId!)
          : base.eq("worker_id", entityId!);
      const { data, error } = await filtered
        .order("work_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        dateISO: r.work_date as string,
        status: r.status as string,
        hours: Number(r.hours ?? 0),
        otHours: Number(r.ot_hours ?? 0),
        shift: (r.shift as string) ?? null,
        note: (r.note as string) ?? null,
      }));
    },
  });
}

export interface WorkerLedgerRow {
  id: string;
  dateISO: string;
  type: string;
  amount: number;
  note: string | null;
  running: number;
}

/** Ascending worker_transactions for one entity with a client-side running
 * balance via runningBalances (web getWorkerLedger parity: order by
 * transaction_date, created_at; running += amount per row).
 * db-types worker_transactions Row: id, transaction_date, type, amount, note,
 * user_id, worker_id. */
export function useWorkerLedger(entityId: string | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.entityLedger(entityId ?? ""),
    enabled: !!user?.id && !!entityId,
    queryFn: async (): Promise<WorkerLedgerRow[]> => {
      const { data, error } = await supabase
        .from("worker_transactions")
        .select("id, transaction_date, created_at, type, amount, note")
        .or(`user_id.eq.${entityId!},worker_id.eq.${entityId!}`)
        .order("transaction_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []).map((r: any) => ({
        id: r.id as string,
        dateISO: r.transaction_date as string,
        type: r.type as string,
        amount: Number(r.amount ?? 0),
        note: (r.note as string) ?? null,
      }));
      const runnings = runningBalances(rows.map((r) => r.amount));
      return rows.map((r, i) => ({ ...r, running: runnings[i] }));
    },
  });
}

/** Working-day flags for a calendar month (Monday-first grid renders from this). */
export function useCalendarDays(year: number, month0: number) {
  const { user } = useSession();
  const mm = String(month0 + 1).padStart(2, "0");
  const first = `${year}-${mm}-01`;
  const last = `${year}-${mm}-${String(new Date(year, month0 + 1, 0).getDate()).padStart(2, "0")}`;
  return useQuery({
    queryKey: qk.calendarMonth(year, month0),
    enabled: !!user?.id,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase
        .from("calendar_days")
        .select("date, is_working")
        .gte("date", first)
        .lte("date", last);
      if (error) throw error;
      const out: Record<string, boolean> = {};
      for (const r of data ?? []) out[r.date] = !!r.is_working;
      return out;
    },
  });
}

export interface SaveRow {
  entityType: "user" | "worker";
  entityId: string;
  status: string;
  hours: number;
  otHours: number;
  note: string | null;
}

export interface SaveLine {
  entity: string;
  id: string;
  status: string | null;
  hours: number;
  otHours: number;
  amount: number;
}

/** Whole-day roster save. Row keys follow the RPC body (entity/id/status/
 * hours/ot_hours/note); the RPC returns {credited_total, lines}. The RPC is
 * absent from mobile db-types, so it goes through the rpc() helper, which
 * casts (supabase.rpc as never) — the established untyped-access idiom
 * (mobile/src/lib/rpc.ts:9; row casts as in operator.ts:49,89-102). */
export async function saveAttendanceDay(input: {
  dateISO: string;
  shiftName: string | null;
  rows: SaveRow[];
}): Promise<{ creditedTotal: number; lines: SaveLine[] }> {
  const res = await rpc<{ credited_total: number | string | null; lines: any[] | null }>(
    "save_attendance_day",
    {
      p_date: input.dateISO,
      p_shift: input.shiftName,
      p_rows: input.rows.map((r) => ({
        entity: r.entityType,
        id: r.entityId,
        status: r.status,
        hours: r.hours,
        ot_hours: r.otHours,
        note: r.note,
      })),
    },
  );
  return {
    creditedTotal: Number(res?.credited_total ?? 0),
    lines: (res?.lines ?? []).map((l: any) => ({
      entity: String(l?.entity ?? ""),
      id: String(l?.id ?? ""),
      status: (l?.status as string) ?? null,
      hours: Number(l?.hours ?? 0),
      otHours: Number(l?.ot_hours ?? 0),
      amount: Number(l?.amount ?? 0),
    })),
  };
}
