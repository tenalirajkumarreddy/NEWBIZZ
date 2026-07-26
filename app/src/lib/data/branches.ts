import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

export interface BranchRow {
  id: string;
  code: string;
  name: string;
  isPlant: boolean;
  isWarehouse: boolean;
  lat: number | null;
  lng: number | null;
  address: string | null;
  status: string;
}

type RawBranch = {
  id: string;
  code: string;
  name: string;
  is_plant: boolean;
  is_warehouse: boolean;
  lat: number | null;
  lng: number | null;
  address: string | null;
  status: string;
};

export async function listBranches(): Promise<BranchRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("branches")
      .select("id, code, name, is_plant, is_warehouse, lat, lng, address, status")
      .order("name")
      .returns<RawBranch[]>(),
    [] as RawBranch[],
    "listBranches",
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isPlant: r.is_plant,
    isWarehouse: r.is_warehouse,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    address: r.address,
    status: r.status,
  }));
}

export async function listWarehouses(): Promise<BranchRow[]> {
  const rows = await listBranches();
  return rows.filter((r) => r.isWarehouse && r.status === "active");
}
