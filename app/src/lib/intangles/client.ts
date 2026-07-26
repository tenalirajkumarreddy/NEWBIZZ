const INTANGLES_BASE = "https://apis.intangles.com";

export interface IntanglesVehicleRaw {
  id: string;
  plate?: string;
  tag?: string;
  last_state?: {
    loc: { lat: number; lng: number };
    sp: number;
    hd: number;
    exb: number;
    timestamp: number;
  };
  fuel?: { amount: number; percentage: number; last_update: number };
  odom?: { vehicle_odo_km: number; vehicle_odo_km_timestamp: number };
  ad_blue?: { lvl: number; per: number; t: number };
  connection_status?: { status: boolean; info_string: string };
  status?: string;
}

export type IntanglesVehicleLive = Required<Pick<IntanglesVehicleRaw, "plate" | "status" | "last_state">> & {
  fuel: NonNullable<IntanglesVehicleRaw["fuel"]>;
  odom: NonNullable<IntanglesVehicleRaw["odom"]>;
  ad_blue: NonNullable<IntanglesVehicleRaw["ad_blue"]>;
  connection_status: NonNullable<IntanglesVehicleRaw["connection_status"]>;
};

export function getIntanglesConfig(): { token: string; accountId: string } {
  const token = process.env.INTANGLES_USER_TOKEN;
  const accountId = process.env.INTANGLES_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error("Intangles not configured (INTANGLES_USER_TOKEN / INTANGLES_ACCOUNT_ID)");
  }
  return { token, accountId };
}

export async function fetchIntangles<T>(
  path: string,
): Promise<T> {
  const { token } = getIntanglesConfig();
  const res = await fetch(`${INTANGLES_BASE}${path}`, {
    headers: { "intangles-user-token": token },
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`Intangles API ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  if (body.status?.code !== 200) {
    throw new Error(`Intangles API error: ${JSON.stringify(body.status)}`);
  }
  return body.v as T;
}

export function buildVehicleListPath(accountId: string, lastloc = true): string {
  return `/vehicle/getlist?psize=200&lastloc=${lastloc ? "true" : "false"}&acc_id=${accountId}&lang=en`;
}
