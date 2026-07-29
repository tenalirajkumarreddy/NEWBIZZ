import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

export interface PayConfigRow {
  userId: string;
  userName: string;
  payType: "monthly" | "daily";
  monthlySalary: number;
  dailyRate: number;
  otHourlyRate: number;
  standardShiftHrs: number;
  paidLeaves: number;
}

export interface AttendanceRow {
  id: string | null;
  userId: string;
  userName: string;
  workDate: string;
  shift: string | null;
  checkIn: string | null;
  hours: number;
  otHours: number;
  status: string;
  note: string | null;
}

export interface AttendanceSummary {
  userId: string;
  userName: string;
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  weekOff: number;
  holiday: number;
  otHours: number;
  pct: number;
}

export interface PayrollRunRow {
  id: string;
  periodMonth: string;
  status: string;
  totalGross: number;
  computedAt: string | null;
  journalEntryId: string | null;
}

export interface PayrollLineRow {
  id: string;
  userId: string;
  userName: string;
  daysPresent: number;
  otHours: number;
  gross: number;
  net: number;
  paidAmount: number;
  paidJournalId: string | null;
}

export interface UserOption {
  id: string;
  fullName: string;
}

export interface PayrollPerson {
  entityType: "user" | "worker";
  entityId: string;
  fullName: string;
  photoUrl: string | null;
  aadharNumber: string | null;
  phone: string | null;
  address: string | null;
}

export interface WorkerRow {
  id: string;
  fullName: string;
  photoUrl: string | null;
  aadharNumber: string | null;
  phone: string | null;
  address: string | null;
  status: string;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  totalHours: number;
}

export interface PayMapping {
  id: string;
  hoursMin: number;
  hoursMax: number;
  amount: number;
}

export interface WorkerBalance {
  userId: string;
  fullName: string;
  balance: number;
  photoUrl: string | null;
}

export interface WorkerLedgerEntry {
  id: string;
  transactionDate: string;
  type: string;
  amount: number;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
  runningBalance: number;
}

export interface CalendarDay {
  id: string;
  date: string;
  isWorking: boolean;
  holidayName: string | null;
  notes: string | null;
}

export interface EmployeeProfile {
  id: string;
  userId: string;
  photoUrl: string | null;
  aadharNumber: string | null;
  phone: string | null;
  address: string | null;
}

export interface DayAttendanceDetail {
  id: string | null;
  userId: string;
  userName: string;
  photoUrl: string | null;
  shift: string | null;
  hours: number;
  otHours: number;
  status: string;
  note: string | null;
  payAmount: number | null;
}

type RawPayConfig = {
  user_id: string;
  pay_type: string;
  monthly_salary: number;
  daily_rate: number;
  ot_hourly_rate: number;
  standard_shift_hrs: number;
  paid_leaves: number;
  user: { full_name: string } | null;
};

type RawAttendance = {
  id: string;
  user_id: string;
  work_date: string;
  shift: string | null;
  check_in: string | null;
  hours: number;
  ot_hours: number;
  status: string;
  note: string | null;
  user: { full_name: string } | null;
};

type RawPayrollRun = {
  id: string;
  period_month: string;
  status: string;
  total_gross: number;
  computed_at: string | null;
  journal_entry_id: string | null;
};

type RawPayrollLine = {
  id: string;
  user_id: string;
  days_present: number;
  ot_hours: number;
  gross: number;
  net: number;
  paid_amount: number;
  paid_journal_id: string | null;
  user: { full_name: string } | null;
};

export async function listPayConfigs(): Promise<PayConfigRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("user_pay_config")
    .select("user_id, pay_type, monthly_salary, daily_rate, ot_hourly_rate, standard_shift_hrs, paid_leaves, user:users(full_name)")
    .returns<RawPayConfig[]>();
  return unwrap(res, [] as RawPayConfig[], "listPayConfigs").map((r) => ({
    userId: r.user_id,
    userName: r.user?.full_name ?? "—",
    payType: (r.pay_type === "daily" ? "daily" : "monthly") as "monthly" | "daily",
    monthlySalary: Number(r.monthly_salary),
    dailyRate: Number(r.daily_rate),
    otHourlyRate: Number(r.ot_hourly_rate),
    standardShiftHrs: Number(r.standard_shift_hrs),
    paidLeaves: Number(r.paid_leaves),
  }));
}

export async function getAttendanceForMonth(month: string): Promise<AttendanceRow[]> {
  const supabase = createClient();
  const { from, to } = monthRange(month);
  const res = await supabase
    .from("attendance")
    .select("id, user_id, work_date, shift, check_in, hours, ot_hours, status, note, user:users(full_name)")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date")
    .returns<RawAttendance[]>();
  return unwrap(res, [] as RawAttendance[], "getAttendanceForMonth").map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user?.full_name ?? "—",
    workDate: r.work_date,
    shift: r.shift,
    checkIn: r.check_in,
    hours: Number(r.hours),
    otHours: Number(r.ot_hours),
    status: r.status,
    note: r.note,
  }));
}

export async function getAttendanceSummary(month: string): Promise<AttendanceSummary[]> {
  const supabase = createClient();
  const { from, to } = monthRange(month);

  const attendance = await getAttendanceForMonth(month);
  const userRes = await supabase.from("users").select("id, full_name").eq("status", "active");
  const users = unwrap(userRes, [], "getAttendanceSummary") as { id: string; full_name: string }[];

  const totalDays = dayCount(month);

  return users.map((u) => {
    const rows = attendance.filter((a) => a.userId === u.id);
    const present = rows.filter((r) => r.status === "present").length;
    const halfDay = rows.filter((r) => r.status === "half_day").length;
    const absent = rows.filter((r) => r.status === "absent").length;
    const leave = rows.filter((r) => r.status === "leave").length;
    const weekOff = rows.filter((r) => r.status === "week_off").length;
    const holiday = rows.filter((r) => r.status === "holiday").length;
    const otHours = rows.reduce((s, r) => s + r.otHours, 0);
    const tracked = present + halfDay * 0.5 + absent + leave;
    const pct = totalDays > 0 ? Math.round((tracked / totalDays) * 10000) / 100 : 0;

    return { userId: u.id, userName: u.full_name, present, halfDay, absent, leave, weekOff, holiday, otHours, pct };
  });
}

export async function listPayrollRuns(): Promise<PayrollRunRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("payroll_runs")
    .select("id, period_month, status, total_gross, computed_at, journal_entry_id")
    .order("period_month", { ascending: false })
    .returns<RawPayrollRun[]>();
  return unwrap(res, [] as RawPayrollRun[], "listPayrollRuns").map((r) => ({
    id: r.id,
    periodMonth: r.period_month,
    status: r.status,
    totalGross: Number(r.total_gross),
    computedAt: r.computed_at,
    journalEntryId: r.journal_entry_id,
  }));
}

export async function getPayrollRunDetail(runId: string): Promise<{
  run: PayrollRunRow;
  lines: PayrollLineRow[];
}> {
  const supabase = createClient();

  const [runRes, linesRes] = await Promise.all([
    supabase
      .from("payroll_runs")
      .select("id, period_month, status, total_gross, computed_at, journal_entry_id")
      .eq("id", runId)
      .maybeSingle()
      .returns<RawPayrollRun | null>(),
    supabase
      .from("payroll_lines")
      .select("id, user_id, days_present, ot_hours, gross, net, paid_amount, paid_journal_id, user:users(full_name)")
      .eq("run_id", runId)
      .returns<RawPayrollLine[]>(),
  ]);

  const rawRun = runRes.data;
  if (!rawRun) throw new Error("Payroll run not found");

  const run: PayrollRunRow = {
    id: rawRun.id,
    periodMonth: rawRun.period_month,
    status: rawRun.status,
    totalGross: Number(rawRun.total_gross),
    computedAt: rawRun.computed_at,
    journalEntryId: rawRun.journal_entry_id,
  };

  const lines: PayrollLineRow[] = (linesRes.data ?? []).map((l) => ({
    id: l.id,
    userId: l.user_id,
    userName: l.user?.full_name ?? "—",
    daysPresent: Number(l.days_present),
    otHours: Number(l.ot_hours),
    gross: Number(l.gross),
    net: Number(l.net),
    paidAmount: Number(l.paid_amount),
    paidJournalId: l.paid_journal_id,
  }));

  return { run, lines };
}

export async function listActiveUsers(): Promise<UserOption[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase.from("users").select("id, full_name").eq("status", "active").order("full_name"),
    [],
    "listActiveUsers",
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    fullName: r.full_name as string,
  }));
}

export async function listShiftTemplates(): Promise<ShiftTemplate[]> {
  const supabase = createClient();
  const res = await supabase.from("shift_templates").select("*").order("name");
  return unwrap(res, [], "listShiftTemplates").map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    startTime: r.start_time as string,
    endTime: r.end_time as string,
    totalHours: Number(r.total_hours),
  }));
}

export async function listPayMappings(): Promise<PayMapping[]> {
  const supabase = createClient();
  const res = await supabase.from("pay_mappings").select("*").order("hours_min");
  return unwrap(res, [], "listPayMappings").map((r: Record<string, unknown>) => ({
    id: r.id as string,
    hoursMin: Number(r.hours_min),
    hoursMax: Number(r.hours_max),
    amount: Number(r.amount),
  }));
}

export async function getWorkersWithBalances(): Promise<WorkerBalance[]> {
  const supabase = createClient();
  const people = await listPayrollPeople();

  // Fetch balances in parallel
  const balances: WorkerBalance[] = [];
  const batchSize = 20;
  for (let i = 0; i < people.length; i += batchSize) {
    const batch = people.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (p) => {
        const { data } = await (supabase.rpc as any)("get_person_balance", { p_entity_id: p.entityId });
        return {
          userId: p.entityId,
          fullName: p.fullName,
          balance: Number(data ?? 0),
          photoUrl: p.photoUrl,
        };
      }),
    );
    balances.push(...results);
  }
  return balances;
}

export async function getWorkerLedger(entityId: string): Promise<WorkerLedgerEntry[]> {
  const supabase = createClient();
  const res = await supabase
    .from("worker_transactions")
    .select("*")
    .or(`user_id.eq.${entityId},worker_id.eq.${entityId}`)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });
  const rows = unwrap(res, [], "getWorkerLedger") as Record<string, unknown>[];
  let running = 0;
  return rows.map((r) => {
    running += Number(r.amount);
    return {
      id: r.id as string,
      transactionDate: r.transaction_date as string,
      type: r.type as string,
      amount: Number(r.amount),
      referenceId: (r.reference_id as string) ?? null,
      note: (r.note as string) ?? null,
      createdAt: r.created_at as string,
      runningBalance: running,
    };
  });
}

export async function getCalendarDays(
  year: number,
  month: number,
): Promise<CalendarDay[]> {
  const supabase = createClient();
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const res = await supabase
    .from("calendar_days")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date");
  return unwrap(res, [], "getCalendarDays").map((r: Record<string, unknown>) => ({
    id: r.id as string,
    date: r.date as string,
    isWorking: r.is_working as boolean,
    holidayName: (r.holiday_name as string) ?? null,
    notes: (r.notes as string) ?? null,
  }));
}

export async function getDayAttendanceDetail(
  date: string,
): Promise<DayAttendanceDetail[]> {
  const supabase = createClient();
  const res = await supabase
    .from("attendance")
    .select("id, user_id, shift, hours, ot_hours, status, note, user:users(full_name)")
    .eq("work_date", date)
    .order("user_id");
  const rows = unwrap(res, [], "getDayAttendanceDetail") as Record<string, unknown>[];

  const userIds = rows.map((r) => r.user_id as string);
  let photoMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const profRes = await supabase
      .from("employee_profiles")
      .select("user_id, photo_url")
      .in("user_id", userIds);
    const profs = unwrap(profRes, [], "getDayAttendanceDetail") as { user_id: string; photo_url: string | null }[];
    photoMap = new Map(profs.map((p) => [p.user_id, p.photo_url]));
  }

  return rows.map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    userName: ((r.user as Record<string, unknown>)?.full_name as string) ?? "—",
    photoUrl: photoMap.get(r.user_id as string) ?? null,
    shift: (r.shift as string) ?? null,
    hours: Number(r.hours),
    otHours: Number(r.ot_hours),
    status: r.status as string,
    note: (r.note as string) ?? null,
    payAmount: null,
  }));
}

export async function getEmployeeProfile(
  userId: string,
): Promise<EmployeeProfile | null> {
  const supabase = createClient();
  const res = await supabase
    .from("employee_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const row = res.data as Record<string, unknown> | null;
  if (!row) return null;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    photoUrl: (row.photo_url as string) ?? null,
    aadharNumber: (row.aadhar_number as string) ?? null,
    phone: (row.phone as string) ?? null,
    address: (row.address as string) ?? null,
  };
}

export async function listPayrollPeople(): Promise<PayrollPerson[]> {
  const supabase = createClient();
  const res = await (supabase.rpc as any)("list_payroll_people");
  const rows = unwrap(res, [], "listPayrollPeople") as Record<string, unknown>[];
  return rows.map((r) => ({
    entityType: r.entity_type as "user" | "worker",
    entityId: r.entity_id as string,
    fullName: r.full_name as string,
    photoUrl: (r.photo_url as string) ?? null,
    aadharNumber: (r.aadhar_number as string) ?? null,
    phone: (r.phone as string) ?? null,
    address: (r.address as string) ?? null,
  }));
}

export async function listWorkers(): Promise<WorkerRow[]> {
  const supabase = createClient();
  const res = await supabase.from("workers").select("*").eq("status", "active").order("full_name");
  return unwrap(res, [], "listWorkers").map((r: Record<string, unknown>) => ({
    id: r.id as string,
    fullName: r.full_name as string,
    photoUrl: (r.photo_url as string) ?? null,
    aadharNumber: (r.aadhar_number as string) ?? null,
    phone: (r.phone as string) ?? null,
    address: (r.address as string) ?? null,
    status: r.status as string,
  }));
}

function monthRange(month: string): { from: string; to: string } {
  const d = new Date(month + "T00:00:00");
  const yr = d.getFullYear();
  const mo = d.getMonth() + 1;
  const from = `${yr}-${String(mo).padStart(2, "0")}-01`;
  const lastDay = new Date(yr, mo, 0).getDate();
  const to = `${yr}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function dayCount(month: string): number {
  const d = new Date(month + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
