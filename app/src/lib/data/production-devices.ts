import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/data/types";
import type { Database } from "@/lib/supabase/database.types";

export interface DeviceConfigRow {
  id: string;
  deviceId: string;
  deviceIndex: number;
  itemId: string;
  itemSku: string;
  itemName: string;
  itemType: Database["public"]["Enums"]["item_type"];
  createdAt: string;
}

export interface ItemOption {
  id: string;
  sku: string;
  name: string;
  type: Database["public"]["Enums"]["item_type"];
}

export interface DeviceOption {
  deviceId: string;
  configCount: number;
}

export async function listDeviceConfigs(): Promise<DeviceConfigRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("production_device_config")
    .select("id, device_id, device_index, item_id, created_at, item:items!inner(id, sku, name, type)")
    .order("device_id")
    .order("device_index");

  return unwrap(res, [], "listDeviceConfigs").map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    deviceIndex: r.device_index,
    itemId: r.item_id,
    itemSku: (r.item as unknown as { sku: string }).sku,
    itemName: (r.item as unknown as { name: string }).name,
    itemType: (r.item as unknown as { type: Database["public"]["Enums"]["item_type"] }).type,
    createdAt: r.created_at,
  }));
}

export async function listItemOptions(): Promise<ItemOption[]> {
  const supabase = createClient();
  const res = await supabase
    .from("items")
    .select("id, sku, name, type")
    .eq("status", "active")
    .order("sku");

  return unwrap(res, [], "listItemOptions").map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    type: r.type as Database["public"]["Enums"]["item_type"],
  }));
}

export async function listDeviceIds(): Promise<DeviceOption[]> {
  const supabase = createClient();
  const res = await supabase
    .from("production_device_config")
    .select("device_id")
    .order("device_id");

  const rows = unwrap(res, [], "listDeviceIds");
  const seen = new Map<string, number>();
  for (const r of rows) {
    seen.set(r.device_id, (seen.get(r.device_id) ?? 0) + 1);
  }
  return Array.from(seen.entries()).map(([deviceId, configCount]) => ({
    deviceId,
    configCount,
  }));
}

export interface HourlyProductionRow {
  deviceId: string;
  deviceIndex: number;
  itemSku: string;
  itemName: string;
  itemType: Database["public"]["Enums"]["item_type"];
  /** Array of 24 hourly counts (index 0 = 00:00-01:00, index 23 = 23:00-00:00) */
  hours: number[];
}

export async function getHourlyProduction(date: string): Promise<HourlyProductionRow[]> {
  const supabase = createClient();
  const res = await (supabase.rpc as any)("get_hourly_production", { p_date: date });
  const rows: Array<{
    device_id: string;
    device_index: number;
    item_sku: string;
    item_name: string;
    item_type: string;
    hour: number;
    total: number;
  }> = (res.data ?? []) as any;

  // Pivot into 24-hour arrays per device+index
  const map = new Map<string, HourlyProductionRow>();
  for (const r of rows) {
    const key = r.device_id + ":" + r.device_index;
    if (!map.has(key)) {
      map.set(key, {
        deviceId: r.device_id,
        deviceIndex: r.device_index,
        itemSku: r.item_sku,
        itemName: r.item_name,
        itemType: r.item_type as Database["public"]["Enums"]["item_type"],
        hours: new Array(24).fill(0),
      });
    }
    if (r.hour >= 0 && r.hour <= 23) {
      map.get(key)!.hours[r.hour] = r.total;
    }
  }

  return Array.from(map.values());
}

export async function listKnownDeviceIds(): Promise<string[]> {
  const supabase = createClient();
  const res = await supabase
    .from("production_logs")
    .select("device_id")
    .order("device_id");

  const rows = unwrap(res, [], "listKnownDeviceIds");
  const seen = new Set<string>();
  for (const r of rows) seen.add(r.device_id);
  return Array.from(seen).sort();
}
