"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:payroll:${label}]`, message);
  return { ok: false, error: msg };
}

export async function savePayConfig(
  configs: {
    userId: string;
    payType: string;
    monthlySalary: number;
    dailyRate: number;
    otHourlyRate: number;
    standardShiftHrs: number;
    paidLeaves: number;
  }[],
): Promise<ActionResult> {
  const supabase = createClient();

  for (const c of configs) {
    // Check if entry exists
    const { data: existing } = await supabase
      .from("user_pay_config")
      .select("id")
      .eq("user_id", c.userId)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from("user_pay_config").update({
          pay_type: c.payType,
          monthly_salary: c.monthlySalary,
          daily_rate: c.dailyRate,
          ot_hourly_rate: c.otHourlyRate,
          standard_shift_hrs: c.standardShiftHrs,
          paid_leaves: c.paidLeaves,
        } as never).eq("id", existing.id)
      : await supabase.from("user_pay_config").insert({
          user_id: c.userId,
          pay_type: c.payType,
          monthly_salary: c.monthlySalary,
          daily_rate: c.dailyRate,
          ot_hourly_rate: c.otHourlyRate,
          standard_shift_hrs: c.standardShiftHrs,
          paid_leaves: c.paidLeaves,
        } as never);
    if (error) return fail("savePayConfig", error.message);
  }

  revalidatePath("/payroll");
  return { ok: true };
}

export async function saveAttendance(
  records: {
    userId: string;
    workDate: string;
    shift: string | null;
    hours: number;
    otHours: number;
    status: string;
    note: string | null;
  }[],
): Promise<ActionResult> {
  const supabase = createClient();

  for (const r of records) {
    const { error } = await supabase.from("attendance").upsert(
      {
        user_id: r.userId,
        work_date: r.workDate,
        shift: r.shift,
        hours: r.hours,
        ot_hours: r.otHours,
        status: r.status as Database["public"]["Enums"]["attendance_status"],
        note: r.note,
      },
      { onConflict: "user_id, work_date" },
    );
    if (error) return fail("saveAttendance", error.message);
  }

  revalidatePath("/payroll");
  return { ok: true };
}

export async function computePayrollRun(month: string): Promise<ActionResult<{ runId: string }>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("compute_payroll", { p_month: month });
  if (error) return fail("computePayrollRun", error.message);
  revalidatePath("/payroll");
  return { ok: true, runId: data as string };
}

export async function postPayrollRun(runId: string): Promise<ActionResult<{ journalEntryId: string }>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("post_payroll_run", { p_run: runId });
  if (error) return fail("postPayrollRun", error.message);
  revalidatePath("/payroll");
  return { ok: true, journalEntryId: data as string };
}

export async function payPayrollLine(lineId: string, payFrom: string = "bank"): Promise<ActionResult<{ journalEntryId: string }>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("pay_payroll_line", { p_line: lineId, p_pay_from: payFrom });
  if (error) return fail("payPayrollLine", error.message);
  revalidatePath("/payroll");
  return { ok: true, journalEntryId: data as string };
}

export async function getPayrollRunDetail(
  runId: string,
): Promise<
  ActionResult<{
    run: {
      id: string;
      periodMonth: string;
      status: string;
      totalGross: number;
      computedAt: string | null;
      journalEntryId: string | null;
    };
    lines: {
      id: string;
      userId: string;
      userName: string;
      daysPresent: number;
      otHours: number;
      gross: number;
      net: number;
      paidAmount: number;
      paidJournalId: string | null;
    }[];
  }>
> {
  const supabase = createClient();

  const [runRes, linesRes] = await Promise.all([
    supabase
      .from("payroll_runs")
      .select("id, period_month, status, total_gross, computed_at, journal_entry_id")
      .eq("id", runId)
      .maybeSingle(),
    supabase
      .from("payroll_lines")
      .select("id, user_id, days_present, ot_hours, gross, net, paid_amount, paid_journal_id, user:users(full_name)")
      .eq("run_id", runId),
  ]);

  const rawRun = runRes.data;
  if (!rawRun || runRes.error) return fail("getPayrollRunDetail", runRes.error?.message ?? "Run not found");

  const run = {
    id: rawRun.id,
    periodMonth: rawRun.period_month,
    status: rawRun.status,
    totalGross: Number(rawRun.total_gross),
    computedAt: rawRun.computed_at,
    journalEntryId: rawRun.journal_entry_id,
  };

  const lines = (linesRes.data ?? []).map((l: Record<string, unknown>) => ({
    id: l.id as string,
    userId: l.user_id as string,
    userName: ((l.user as { full_name?: string } | null)?.full_name) ?? "—",
    daysPresent: Number(l.days_present),
    otHours: Number(l.ot_hours),
    gross: Number(l.gross),
    net: Number(l.net),
    paidAmount: Number(l.paid_amount),
    paidJournalId: l.paid_journal_id as string | null,
  }));

  return { ok: true, run, lines };
}

export async function saveDailyAttendance(
  date: string,
  shiftTemplateId: string | null,
  workers: {
    entityType: "user" | "worker";
    entityId: string;
    present: boolean;
    status: string;
    hours: number;
    otHours: number;
    shift: string | null;
    note: string | null;
  }[],
): Promise<ActionResult> {
  const supabase = createClient();

  await supabase.from("calendar_days").upsert(
    { date, is_working: true },
    { onConflict: "date" },
  );

  for (const w of workers) {
    if (!w.present) continue;

    const isUser = w.entityType === "user";

    if (isUser) {
      const { error: attErr } = await supabase.from("attendance").upsert(
        {
          user_id: w.entityId,
          work_date: date,
          shift: w.shift,
          hours: w.hours,
          ot_hours: w.otHours,
          status: w.status as Database["public"]["Enums"]["attendance_status"],
          note: w.note,
        },
        { onConflict: "user_id, work_date" },
      );
      if (attErr) return fail("saveDailyAttendance:attendance", attErr.message);
    } else {
      const { error: attErr } = await supabase.from("attendance").upsert(
        {
          worker_id: w.entityId,
          work_date: date,
          shift: w.shift,
          hours: w.hours,
          ot_hours: w.otHours,
          status: w.status as Database["public"]["Enums"]["attendance_status"],
          note: w.note,
        },
        { onConflict: "worker_id, work_date" },
      );
      if (attErr) return fail("saveDailyAttendance:attendance", attErr.message);
    }

    let payAmount = 0;
    const { data: mappings } = await supabase
      .from("pay_mappings")
      .select("hours_min, hours_max, amount")
      .order("hours_min");
    if (mappings) {
      for (const m of mappings) {
        if (w.hours >= m.hours_min && w.hours < m.hours_max) {
          payAmount = Number(m.amount);
          break;
        }
      }
    }

    const { data: att } = await supabase
      .from("attendance")
      .select("id")
      .eq(isUser ? "user_id" : "worker_id", w.entityId)
      .eq("work_date", date)
      .maybeSingle();

    const txPayload: Record<string, unknown> = {
      transaction_date: date,
      type: "attendance_pay",
      amount: payAmount,
      reference_id: att?.id ?? null,
      note: `Attendance ${date} — ${w.hours}h ${w.otHours > 0 ? `(+${w.otHours}h OT)` : ""}`,
    };
    txPayload[isUser ? "user_id" : "worker_id"] = w.entityId;

    const { error: txErr } = await (supabase.from("worker_transactions").insert as any)(txPayload);
    if (txErr) return fail("saveDailyAttendance:transaction", txErr.message);
    if (txErr) return fail("saveDailyAttendance:transaction", txErr.message);
  }

  revalidatePath("/payroll");
  return { ok: true };
}

export async function recordPayment(
  userId: string,
  amount: number,
  method: string,
  note: string | null,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("worker_transactions").insert({
    user_id: userId,
    transaction_date: new Date().toISOString().slice(0, 10),
    type: "payment",
    amount: -Math.abs(amount),
    note: `Payment via ${method}${note ? ` — ${note}` : ""}`,
  });
  if (error) return fail("recordPayment", error.message);
  revalidatePath("/payroll");
  return { ok: true };
}

export async function recordAdvance(
  userId: string,
  amount: number,
  note: string | null,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("worker_transactions").insert({
    user_id: userId,
    transaction_date: new Date().toISOString().slice(0, 10),
    type: "advance",
    amount: -Math.abs(amount),
    note: note ?? "Advance given",
  });
  if (error) return fail("recordAdvance", error.message);
  revalidatePath("/payroll");
  return { ok: true };
}

export async function adjustBalance(
  userId: string,
  amount: number,
  note: string | null,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("worker_transactions").insert({
    user_id: userId,
    transaction_date: new Date().toISOString().slice(0, 10),
    type: "adjustment",
    amount,
    note: note ?? "Manual adjustment",
  });
  if (error) return fail("adjustBalance", error.message);
  revalidatePath("/payroll");
  return { ok: true };
}

export async function saveShiftTemplate(
  id: string | null,
  name: string,
  startTime: string,
  endTime: string,
  totalHours: number,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("shift_templates").upsert(
    { id: id ?? undefined, name, start_time: startTime, end_time: endTime, total_hours: totalHours },
    { onConflict: "id" },
  );
  if (error) return fail("saveShiftTemplate", error.message);
  revalidatePath("/payroll");
  return { ok: true };
}

export async function deleteShiftTemplate(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("shift_templates").delete().eq("id", id);
  if (error) return fail("deleteShiftTemplate", error.message);
  revalidatePath("/payroll");
  return { ok: true };
}

export async function savePayMapping(
  id: string | null,
  hoursMin: number,
  hoursMax: number,
  amount: number,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("pay_mappings").upsert(
    { id: id ?? undefined, hours_min: hoursMin, hours_max: hoursMax, amount },
    { onConflict: "id" },
  );
  if (error) return fail("savePayMapping", error.message);
  revalidatePath("/payroll");
  return { ok: true };
}

export async function deletePayMapping(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("pay_mappings").delete().eq("id", id);
  if (error) return fail("deletePayMapping", error.message);
  revalidatePath("/payroll");
  return { ok: true };
}

export async function saveEmployeeProfile(
  userId: string,
  photoUrl: string | null,
  aadharNumber: string | null,
  phone: string | null,
  address: string | null,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("employee_profiles").upsert(
    { user_id: userId, photo_url: photoUrl, aadhar_number: aadharNumber, phone, address },
    { onConflict: "user_id" },
  );
  if (error) return fail("saveEmployeeProfile", error.message);
  revalidatePath("/payroll");
  return { ok: true };
}

export async function markCalendarDay(
  date: string,
  isWorking: boolean,
  holidayName: string | null,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("calendar_days").upsert(
    { date, is_working: isWorking, holiday_name: holidayName },
    { onConflict: "date" },
  );
  if (error) return fail("markCalendarDay", error.message);
  revalidatePath("/payroll");
  return { ok: true };
}

// ── Server-action wrappers for server-only data readers ──────────────

export async function fetchDayAttendanceDetail(date: string) {
  const { getDayAttendanceDetail } = await import("@/lib/data/payroll");
  return getDayAttendanceDetail(date);
}

export async function fetchEmployeeProfile(userId: string) {
  const { getEmployeeProfile } = await import("@/lib/data/payroll");
  return getEmployeeProfile(userId);
}

export async function fetchWorkerLedger(userId: string) {
  const { getWorkerLedger } = await import("@/lib/data/payroll");
  return getWorkerLedger(userId);
}

export async function fetchWorkers() {
  const { listWorkers } = await import("@/lib/data/payroll");
  return listWorkers();
}

export async function addWorker(
  fullName: string,
  phone: string | null,
  aadharNumber: string | null,
  address: string | null,
): Promise<ActionResult<{ workerId: string }>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("workers")
    .insert({ full_name: fullName, phone, aadhar_number: aadharNumber, address })
    .select("id")
    .single();
  if (error) return fail("addWorker", error.message);
  revalidatePath("/payroll");
  return { ok: true, workerId: data.id };
}

export async function saveWorkerProfile(
  workerId: string,
  photoUrl: string | null,
  aadharNumber: string | null,
  phone: string | null,
  address: string | null,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("workers")
    .update({ photo_url: photoUrl, aadhar_number: aadharNumber, phone, address })
    .eq("id", workerId);
  if (error) return fail("saveWorkerProfile", error.message);
  revalidatePath("/payroll");
  return { ok: true };
}
