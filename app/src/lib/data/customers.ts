import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type CustomerKind = Database["public"]["Enums"]["customer_kind"];

export interface CustomerListRow {
  id: string;
  code: string;
  name: string;
  primaryStoreKind: CustomerKind | null;
  gstin: string | null;
  phone: string | null;
  imageUrl: string | null;
  creditLimit: number;
  creditDays: number;
  status: string;
  storeCount: number;
  outstanding: number;
}

type RawSearchResult = {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  image_url: string | null;
  credit_limit: number;
  credit_days: number;
  status: string;
  store_count: number;
  outstanding: number;
  primary_store_kind: CustomerKind | null;
};

export async function listCustomers(opts: {
  status?: string;
  kind?: CustomerKind;
  query?: string;
  limit?: number;
} = {}): Promise<CustomerListRow[]> {
  const supabase = createClient();
  const res = await supabase
    .rpc("search_customers", {
      p_query: opts.query ?? "",
      p_kind: opts.kind,
      p_status: opts.status,
      p_limit: opts.limit ?? 500,
    })
    .returns<RawSearchResult[]>();

  const rows = unwrap(res, [] as RawSearchResult[], "listCustomers");
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    primaryStoreKind: r.primary_store_kind,
    gstin: r.gstin,
    phone: r.phone,
    imageUrl: r.image_url,
    creditLimit: Number(r.credit_limit),
    creditDays: Number(r.credit_days),
    status: r.status,
    storeCount: Number(r.store_count),
    outstanding: Number(r.outstanding),
  }));
}

export interface StoreListRow {
  id: string;
  code: string;
  name: string;
  kind: CustomerKind;
  city: string | null;
  stateCode: string;
  phone: string | null;
  isPrimary: boolean;
  status: string;
  imageUrl: string | null;
  priceListName: string | null;
}

type RawStore = {
  id: string;
  code: string;
  name: string;
  kind: CustomerKind;
  city: string | null;
  state_code: string;
  phone: string | null;
  is_primary: boolean;
  status: string;
  image_url: string | null;
  price_list: { name: string } | null;
};

export interface CustomerDetail {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  email: string | null;
  stateCode: string;
  imageUrl: string | null;
  creditLimit: number;
  creditDays: number;
  status: string;
  outstanding: number;
  creditUtilisation: number;
  overLimit: boolean;
  aging: { bucket: string; amount: number }[];
  stores: StoreListRow[];
}

const AGE_BUCKET_ORDER = ["current", "0-30", "31-60", "61-90", "90+"];

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const supabase = createClient();
  const [custRes, storesRes, outRes, agingRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, name, gstin, pan, phone, email, state_code, image_url, credit_limit, credit_days, status")
      .eq("id", id)
      .maybeSingle()
      .returns<{
        id: string; code: string; name: string;
        gstin: string | null; pan: string | null; phone: string | null;
        email: string | null; state_code: string; image_url: string | null;
        credit_limit: number; credit_days: number; status: string;
      } | null>(),
    supabase
      .from("customer_stores")
      .select("id, code, name, kind, city, state_code, phone, is_primary, status, image_url, price_list:price_lists(name)")
      .eq("customer_id", id)
      .order("is_primary", { ascending: false })
      .order("name")
      .returns<RawStore[]>(),
    supabase.rpc("customer_outstanding", { p_customer: id }),
    supabase.rpc("get_ar_aging").returns<{ customer_id: string; outstanding: number; bucket: string }[]>(),
  ]);

  const c = unwrap(custRes, null, "getCustomer");
  if (!c) return null;
  const stores = unwrap(storesRes, [] as RawStore[], "getCustomer:stores");
  const outstanding = Number(outRes.data ?? 0);

  const agingRows = agingRes.error ? [] : (agingRes.data ?? []);
  const bucketMap = new Map<string, number>();
  for (const r of agingRows) {
    if (r.customer_id !== id) continue;
    bucketMap.set(r.bucket, (bucketMap.get(r.bucket) ?? 0) + Number(r.outstanding));
  }
  const aging = [...bucketMap.entries()]
    .map(([bucket, amount]) => ({ bucket, amount }))
    .sort((a, b) => AGE_BUCKET_ORDER.indexOf(a.bucket) - AGE_BUCKET_ORDER.indexOf(b.bucket));

  const creditLimit = Number(c.credit_limit);
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    gstin: c.gstin,
    pan: c.pan,
    phone: c.phone,
    email: c.email,
    stateCode: c.state_code,
    imageUrl: c.image_url,
    creditLimit,
    creditDays: Number(c.credit_days),
    status: c.status,
    outstanding,
    creditUtilisation: creditLimit > 0 ? outstanding / creditLimit : 0,
    overLimit: creditLimit > 0 && outstanding > creditLimit,
    aging,
    stores: stores.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      kind: s.kind,
      city: s.city,
      stateCode: s.state_code,
      phone: s.phone,
      isPrimary: s.is_primary,
      status: s.status,
      imageUrl: s.image_url,
      priceListName: s.price_list?.name ?? null,
    })),
  };
}

export interface StoreDetail {
  id: string;
  customerId: string;
  customerName: string;
  code: string;
  name: string;
  kind: CustomerKind;
  contactName: string | null;
  phone: string | null;
  addressLine: string | null;
  area: string | null;
  city: string | null;
  pincode: string | null;
  stateCode: string;
  geoLat: number | null;
  geoLng: number | null;
  isPrimary: boolean;
  status: string;
  imageUrl: string | null;
  priceListName: string | null;
  routeName: string | null;
  outstanding: number;
}

export async function getStore(storeId: string): Promise<StoreDetail | null> {
  const supabase = createClient();
  const [storeRes, outRes] = await Promise.all([
    supabase
      .from("customer_stores")
      .select(
        "id, customer_id, code, name, kind, contact_name, phone, address_line, area, city, pincode, " +
          "state_code, geo_lat, geo_lng, is_primary, status, image_url, " +
          "customer:customers(name), price_list:price_lists(name), route:routes(name)",
      )
      .eq("id", storeId)
      .maybeSingle()
      .returns<{
        id: string; customer_id: string; code: string; name: string; kind: CustomerKind;
        contact_name: string | null; phone: string | null; address_line: string | null;
        area: string | null; city: string | null; pincode: string | null; state_code: string;
        geo_lat: number | null; geo_lng: number | null; is_primary: boolean; status: string;
        image_url: string | null;
        customer: { name: string } | null;
        price_list: { name: string } | null;
        route: { name: string } | null;
      } | null>(),
    supabase.rpc("store_outstanding", { p_store: storeId }),
  ]);

  const s = unwrap(storeRes, null, "getStore");
  if (!s) return null;
  return {
    id: s.id,
    customerId: s.customer_id,
    customerName: s.customer?.name ?? "—",
    code: s.code,
    name: s.name,
    kind: s.kind,
    contactName: s.contact_name,
    phone: s.phone,
    addressLine: s.address_line,
    area: s.area,
    city: s.city,
    pincode: s.pincode,
    stateCode: s.state_code,
    geoLat: s.geo_lat == null ? null : Number(s.geo_lat),
    geoLng: s.geo_lng == null ? null : Number(s.geo_lng),
    isPrimary: s.is_primary,
    status: s.status,
    imageUrl: s.image_url,
    priceListName: s.price_list?.name ?? null,
    routeName: s.route?.name ?? null,
    outstanding: Number(outRes.data ?? 0),
  };
}

export type ActivityKind = "invoice" | "receipt" | "credit_note" | "order" | "visit";

export interface ActivityRow {
  eventDate: string;
  kind: ActivityKind;
  refId: string | null;
  refNo: string | null;
  storeId: string | null;
  storeName: string | null;
  description: string;
  debit: number;
  credit: number;
  status: string | null;
  balance: number;
}

type RawActivity = {
  event_date: string;
  kind: string;
  ref_id: string | null;
  ref_no: string | null;
  store_id: string | null;
  store_name: string | null;
  description: string;
  debit: number;
  credit: number;
  status: string | null;
};

export async function getCustomerActivity(
  customerId: string,
  opts: { storeId?: string; from?: string; to?: string } = {},
): Promise<ActivityRow[]> {
  const supabase = createClient();
  const res = await supabase
    .rpc("customer_activity", {
      p_customer: customerId,
      ...(opts.storeId ? { p_store: opts.storeId } : {}),
      ...(opts.from ? { p_from: opts.from } : {}),
      ...(opts.to ? { p_to: opts.to } : {}),
    })
    .returns<RawActivity[]>();
  const rows = unwrap(res, [] as RawActivity[], "getCustomerActivity");

  let bal = 0;
  return rows.map((r) => {
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    bal += debit - credit;
    return {
      eventDate: r.event_date,
      kind: r.kind as ActivityKind,
      refId: r.ref_id,
      refNo: r.ref_no,
      storeId: r.store_id,
      storeName: r.store_name,
      description: r.description,
      debit,
      credit,
      status: r.status,
      balance: bal,
    };
  });
}
