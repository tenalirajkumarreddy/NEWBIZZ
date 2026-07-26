import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database, Json } from "@/lib/supabase/database.types";

type LeadStatus = Database["public"]["Enums"]["lead_status"];
type InteractionType = Database["public"]["Enums"]["interaction_type"];
type ComplaintStatus = Database["public"]["Enums"]["complaint_status"];
type ComplaintResolution = Database["public"]["Enums"]["complaint_resolution"];

// ── Leads ──

export interface LeadRow {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  status: LeadStatus;
  notes: string | null;
  followUpDate: string | null;
  convertedCustomerId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export async function listLeads(opts: {
  status?: LeadStatus;
  assignedTo?: string;
  query?: string;
  limit?: number;
} = {}): Promise<LeadRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("leads")
    .select("id, name, company, phone, email, source, assigned_to, status, notes, follow_up_date, converted_customer_id, created_by, created_at, updated_at, assigned:users!leads_assigned_to_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.assignedTo) q = q.eq("assigned_to", opts.assignedTo);
  if (opts.query) {
    const like = `%${opts.query}%`;
    q = q.or(`name.ilike.${like},company.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
  }

  const res = await q.returns<{
    id: string; name: string; company: string | null; phone: string | null;
    email: string | null; source: string | null; assigned_to: string | null;
    status: LeadStatus; notes: string | null; follow_up_date: string | null;
    converted_customer_id: string | null; created_by: string | null;
    created_at: string; updated_at: string | null;
    assigned: { full_name: string } | null;
  }[]>();

  const rows = unwrap(res, [], "listLeads");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    phone: r.phone,
    email: r.email,
    source: r.source,
    assignedTo: r.assigned_to,
    assignedToName: r.assigned?.full_name ?? null,
    status: r.status,
    notes: r.notes,
    followUpDate: r.follow_up_date,
    convertedCustomerId: r.converted_customer_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getLead(id: string): Promise<LeadRow | null> {
  const supabase = createClient();
  const res = await supabase
    .from("leads")
    .select("id, name, company, phone, email, source, assigned_to, status, notes, follow_up_date, converted_customer_id, created_by, created_at, updated_at, assigned:users!leads_assigned_to_fkey(full_name)")
    .eq("id", id)
    .maybeSingle<{
      id: string; name: string; company: string | null; phone: string | null;
      email: string | null; source: string | null; assigned_to: string | null;
      status: LeadStatus; notes: string | null; follow_up_date: string | null;
      converted_customer_id: string | null; created_by: string | null;
      created_at: string; updated_at: string | null;
      assigned: { full_name: string } | null;
    } | null>();

  const r = unwrap(res, null, "getLead");
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    company: r.company,
    phone: r.phone,
    email: r.email,
    source: r.source,
    assignedTo: r.assigned_to,
    assignedToName: r.assigned?.full_name ?? null,
    status: r.status,
    notes: r.notes,
    followUpDate: r.follow_up_date,
    convertedCustomerId: r.converted_customer_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Interactions ──

export interface InteractionRow {
  id: string;
  customerStoreId: string | null;
  leadId: string | null;
  type: InteractionType;
  byUserId: string | null;
  byUserName: string | null;
  note: string | null;
  createdAt: string;
}

export async function listInteractions(opts: {
  storeId?: string;
  leadId?: string;
  limit?: number;
} = {}): Promise<InteractionRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("interactions")
    .select("id, customer_store_id, lead_id, type, by_user_id, note, created_at, by_user:users!interactions_by_user_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.storeId) q = q.eq("customer_store_id", opts.storeId);
  if (opts.leadId) q = q.eq("lead_id", opts.leadId);

  const res = await q.returns<{
    id: string; customer_store_id: string | null; lead_id: string | null;
    type: InteractionType; by_user_id: string | null;
    note: string | null; created_at: string;
    by_user: { full_name: string } | null;
  }[]>();

  const rows = unwrap(res, [], "listInteractions");
  return rows.map((r) => ({
    id: r.id,
    customerStoreId: r.customer_store_id,
    leadId: r.lead_id,
    type: r.type,
    byUserId: r.by_user_id,
    byUserName: r.by_user?.full_name ?? null,
    note: r.note,
    createdAt: r.created_at,
  }));
}

// ── Complaints ──

export interface ComplaintRow {
  id: string;
  customerStoreId: string;
  storeName: string | null;
  status: ComplaintStatus;
  resolution: ComplaintResolution | null;
  creditNoteId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
  updatedAt: string | null;
}

export async function listComplaints(opts: {
  status?: ComplaintStatus;
  storeId?: string;
  limit?: number;
} = {}): Promise<ComplaintRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("complaints")
    .select("id, customer_store_id, status, resolution, credit_note_id, note, created_by, created_at, resolved_at, updated_at, store:customer_stores!complaints_customer_store_id_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.storeId) q = q.eq("customer_store_id", opts.storeId);

  const res = await q.returns<{
    id: string; customer_store_id: string; status: ComplaintStatus;
    resolution: ComplaintResolution | null; credit_note_id: string | null;
    note: string | null; created_by: string | null;
    created_at: string; resolved_at: string | null; updated_at: string | null;
    store: { name: string } | null;
  }[]>();

  const rows = unwrap(res, [], "listComplaints");
  return rows.map((r) => ({
    id: r.id,
    customerStoreId: r.customer_store_id,
    storeName: r.store?.name ?? null,
    status: r.status,
    resolution: r.resolution,
    creditNoteId: r.credit_note_id,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    updatedAt: r.updated_at,
  }));
}

export async function getComplaint(id: string): Promise<ComplaintRow | null> {
  const supabase = createClient();
  const res = await supabase
    .from("complaints")
    .select("id, customer_store_id, status, resolution, credit_note_id, note, created_by, created_at, resolved_at, updated_at, store:customer_stores!complaints_customer_store_id_fkey(name)")
    .eq("id", id)
    .maybeSingle<{
      id: string; customer_store_id: string; status: ComplaintStatus;
      resolution: ComplaintResolution | null; credit_note_id: string | null;
      note: string | null; created_by: string | null;
      created_at: string; resolved_at: string | null; updated_at: string | null;
      store: { name: string } | null;
    } | null>();

  const r = unwrap(res, null, "getComplaint");
  if (!r) return null;
  return {
    id: r.id,
    customerStoreId: r.customer_store_id,
    storeName: r.store?.name ?? null,
    status: r.status,
    resolution: r.resolution,
    creditNoteId: r.credit_note_id,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    updatedAt: r.updated_at,
  };
}

// ── Campaigns ──

export interface CampaignRow {
  id: string;
  name: string;
  audienceJson: Database["public"]["Tables"]["campaigns"]["Row"]["audience_json"];
  message: string | null;
  channel: Database["public"]["Enums"]["campaign_channel"];
  scheduleAt: string | null;
  status: Database["public"]["Enums"]["campaign_status"];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CampaignResultRow {
  id: string;
  campaignId: string;
  customerStoreId: string | null;
  storeName: string | null;
  sent: boolean;
  read: boolean;
  orderId: string | null;
  createdAt: string;
}

export async function listCampaigns(opts: {
  status?: Database["public"]["Enums"]["campaign_status"];
  channel?: Database["public"]["Enums"]["campaign_channel"];
} = {}): Promise<CampaignRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("campaigns")
    .select("id, name, audience_json, message, channel, schedule_at, status, created_by, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.channel) q = q.eq("channel", opts.channel);

  const res = await q.returns<{
    id: string; name: string; audience_json: Json;
    message: string | null; channel: Database["public"]["Enums"]["campaign_channel"];
    schedule_at: string | null; status: Database["public"]["Enums"]["campaign_status"];
    created_by: string | null; created_at: string; updated_at: string | null;
  }[]>();

  const rows = unwrap(res, [], "listCampaigns");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    audienceJson: r.audience_json,
    message: r.message,
    channel: r.channel,
    scheduleAt: r.schedule_at,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const supabase = createClient();
  const res = await supabase
    .from("campaigns")
    .select("id, name, audience_json, message, channel, schedule_at, status, created_by, created_at, updated_at")
    .eq("id", id)
    .maybeSingle<{
      id: string; name: string; audience_json: Json;
      message: string | null; channel: Database["public"]["Enums"]["campaign_channel"];
      schedule_at: string | null; status: Database["public"]["Enums"]["campaign_status"];
      created_by: string | null; created_at: string; updated_at: string | null;
    } | null>();

  const r = unwrap(res, null, "getCampaign");
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    audienceJson: r.audience_json,
    message: r.message,
    channel: r.channel,
    scheduleAt: r.schedule_at,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getCampaignResults(campaignId: string): Promise<CampaignResultRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("campaign_results")
    .select("id, campaign_id, customer_store_id, sent, read, order_id, created_at, store:customer_stores!campaign_results_customer_store_id_fkey(name)")
    .eq("campaign_id", campaignId)
    .returns<{
      id: string; campaign_id: string; customer_store_id: string | null;
      sent: boolean; read: boolean; order_id: string | null; created_at: string;
      store: { name: string } | null;
    }[]>();

  const rows = unwrap(res, [], "getCampaignResults");
  return rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    customerStoreId: r.customer_store_id,
    storeName: r.store?.name ?? null,
    sent: r.sent,
    read: r.read,
    orderId: r.order_id,
    createdAt: r.created_at,
  }));
}

// ── Store 360° View ──

export interface Store360Data {
  store: {
    id: string;
    customerId: string;
    customerName: string;
    code: string;
    name: string;
    kind: string;
    city: string | null;
    phone: string | null;
    status: string;
    routeName: string | null;
    imageUrl: string | null;
  };
  outstanding: number;
  mtdSales: number;
  openComplaints: number;
  schemeProgress: { schemeName: string; totalVolume: number; targetCases: number; percent: number } | null;
  lastOrder: { date: string; total: number } | null;
  lastInteraction: { date: string; type: InteractionType } | null;
}

export async function getStore360(storeId: string): Promise<Store360Data | null> {
  const supabase = createClient();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  const [storeRes, outRes, mtdRes, complaintsRes, schemeRes, orderRes, interactionRes] = await Promise.all([
    supabase
      .from("customer_stores")
      .select("id, customer_id, code, name, kind, city, phone, status, image_url, customer:customers(name), route:routes(name)")
      .eq("id", storeId)
      .maybeSingle<{
        id: string; customer_id: string; code: string; name: string;
        kind: string; city: string | null; phone: string | null; status: string; image_url: string | null;
        customer: { name: string } | null; route: { name: string } | null;
      } | null>(),
    supabase.rpc("store_outstanding", { p_store: storeId }),
    supabase
      .from("invoices")
      .select("grand_total")
      .eq("store_id", storeId)
      .eq("status", "posted")
      .gte("invoice_date", monthStart),
    supabase
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .eq("customer_store_id", storeId)
      .eq("status", "open"),
    supabase
      .from("scheme_eligibility")
      .select("total_volume, scheme:schemes!scheme_eligibility_scheme_id_fkey(name, tiers_json)")
      .eq("customer_store_id", storeId)
      .in("status", ["pending_approval", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ total_volume: number; scheme: { name: string; tiers_json: unknown } | null } | null>(),
    supabase
      .from("sales_orders")
      .select("order_date")
      .eq("store_id", storeId)
      .neq("status", "cancelled")
      .order("order_date", { ascending: false })
      .limit(1)
      .maybeSingle<{ order_date: string } | null>(),
    supabase
      .from("interactions")
      .select("created_at, type")
      .eq("customer_store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const s = unwrap(storeRes, null, "getStore360");
  if (!s) return null;

  const outstanding = Number(outRes.data ?? 0);
  const mtdInvoices = unwrap(mtdRes, [], "getStore360:mtd");
  const mtdSales = mtdInvoices.reduce((sum, inv) => sum + Number(inv.grand_total), 0);

  const schemeElig = schemeRes.data;
  let schemeProgress: Store360Data["schemeProgress"] = null;
  if (schemeElig && schemeElig.scheme && Array.isArray(schemeElig.scheme.tiers_json) && schemeElig.scheme.tiers_json.length > 0) {
    const tiers = schemeElig.scheme.tiers_json as { min_cases: number; rebate_per_case: number }[];
    const topTier = tiers.reduce((max, t) => (t.min_cases > max.min_cases ? t : max), tiers[0]);
    schemeProgress = {
      schemeName: schemeElig.scheme.name,
      totalVolume: Number(schemeElig.total_volume),
      targetCases: topTier.min_cases,
      percent: topTier.min_cases > 0 ? Math.min(100, (Number(schemeElig.total_volume) / topTier.min_cases) * 100) : 0,
    };
  }

  const lastOrderRow = orderRes.data;
  const lastInteractionRow = interactionRes.data;

  return {
    store: {
      id: s.id,
      customerId: s.customer_id,
      customerName: s.customer?.name ?? "—",
      code: s.code,
      name: s.name,
      kind: s.kind,
      city: s.city,
      phone: s.phone,
      status: s.status,
      routeName: s.route?.name ?? null,
      imageUrl: s.image_url,
    },
    outstanding,
    mtdSales,
    openComplaints: complaintsRes.count ?? 0,
    schemeProgress,
    lastOrder: lastOrderRow ? { date: lastOrderRow.order_date, total: 0 } : null,
    lastInteraction: lastInteractionRow ? { date: lastInteractionRow.created_at, type: lastInteractionRow.type as InteractionType } : null,
  };
}

// ── Follow-up reminders ──

export interface FollowUpRow {
  id: string;
  type: "lead" | "store";
  label: string;
  subtitle: string | null;
  reason: string;
  dueLabel: string;
  dueTone: "grn" | "amb" | "red";
  lastInteraction: string | null;
  daysSinceLast: number;
  outstanding: number;
  openComplaints: number;
}

export async function listFollowUps(): Promise<FollowUpRow[]> {
  const supabase = createClient();

  const [leadsRes, interactionsRes, complaintsRes, storesRes] = await Promise.all([
    supabase.from("leads").select("id, name, company, follow_up_date, status").eq("status", "new").or("follow_up_date.lte.now,follow_up_date.is.null").limit(50),
    supabase.from("interactions").select("customer_store_id, created_at, type").order("created_at", { ascending: false }),
    supabase.from("complaints").select("customer_store_id, status"),
    supabase.from("customer_stores").select("id, name, customer:customers!customer_stores_customer_id_fkey(name)").eq("status", "active").limit(200),
  ]);

  const reminders: FollowUpRow[] = [];

  // ── Lead follow-ups ──
  const leads = unwrap(leadsRes, [], "listFollowUps:leads");
  const today = new Date();
  for (const l of leads) {
    if (l.follow_up_date) {
      const due = new Date(l.follow_up_date);
      const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
      reminders.push({
        id: `lead-${l.id}`,
        type: "lead",
        label: l.name,
        subtitle: l.company,
        reason: "Follow-up due",
        dueLabel: diff < 0 ? `${Math.abs(diff)}d overdue` : diff === 0 ? "Today" : `In ${diff}d`,
        dueTone: diff < 0 ? "red" : diff <= 2 ? "amb" : "grn",
        lastInteraction: null,
        daysSinceLast: 0,
        outstanding: 0,
        openComplaints: 0,
      });
    }
  }

  // ── Store follow-ups (stale interactions) ──
  const stores = unwrap(storesRes, [], "listFollowUps:stores");
  const interactions = unwrap(interactionsRes, [], "listFollowUps:interactions");
  const complaints = unwrap(complaintsRes, [], "listFollowUps:complaints");

  const lastInteractionByStore = new Map<string, { created_at: string; type: string }>();
  for (const ix of interactions) {
    if (ix.customer_store_id && !lastInteractionByStore.has(ix.customer_store_id)) {
      lastInteractionByStore.set(ix.customer_store_id, ix);
    }
  }

  const openComplaintsByStore = new Map<string, number>();
  for (const c of complaints) {
    if (c.status === "open") {
      openComplaintsByStore.set(c.customer_store_id, (openComplaintsByStore.get(c.customer_store_id) ?? 0) + 1);
    }
  }

  for (const s of stores) {
    const last = lastInteractionByStore.get(s.id);
    const daysSince = last ? Math.floor((today.getTime() - new Date(last.created_at).getTime()) / 86400000) : 999;
    const openCount = openComplaintsByStore.get(s.id) ?? 0;

    if (daysSince > 7 || openCount > 0) {
      reminders.push({
        id: `store-${s.id}`,
        type: "store",
        label: s.name,
        subtitle: (s.customer as unknown as { name: string } | null)?.name ?? null,
        reason: daysSince > 30 ? "No interaction in 30d+" : daysSince > 14 ? "No interaction in 14d+" : daysSince > 7 ? "No interaction in 7d+" : `${openCount} open complaint${openCount > 1 ? "s" : ""}`,
        dueLabel: last ? `${daysSince}d ago` : "Never",
        dueTone: daysSince > 14 ? "red" : daysSince > 7 ? "amb" : "grn",
        lastInteraction: last?.created_at ?? null,
        daysSinceLast: daysSince,
        outstanding: 0,
        openComplaints: openCount,
      });
    }
  }

  reminders.sort((a, b) => b.daysSinceLast - a.daysSinceLast);
  return reminders;
}

// ── KPI counts ──

export interface CrmKpis {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  lostLeads: number;
  openComplaints: number;
  dueFollowUps: number;
}

export async function getCrmKpis(): Promise<CrmKpis> {
  const supabase = createClient();

  const [leadsRes, openComplaintsRes, followUps] = await Promise.all([
    supabase.from("leads").select("status"),
    supabase.from("complaints").select("id", { count: "exact", head: true }).eq("status", "open"),
    listFollowUps(),
  ]);

  const allLeads = unwrap(leadsRes, [], "getCrmKpis:leads");
  const openComplaints = openComplaintsRes.count ?? 0;

  const counts: Record<string, number> = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };
  for (const l of allLeads) {
    if (l.status in counts) counts[l.status]++;
  }

  return {
    totalLeads: allLeads.length,
    newLeads: counts.new,
    contactedLeads: counts.contacted,
    qualifiedLeads: counts.qualified,
    convertedLeads: counts.converted,
    lostLeads: counts.lost,
    openComplaints,
    dueFollowUps: followUps.length,
  };
}
