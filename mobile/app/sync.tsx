import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import * as Network from "expo-network";
import { Wifi, WifiOff, Activity, RefreshCw, Database, Clock, ShieldCheck } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/rpc";
import { timeAgoIST } from "@/lib/format";
import { tokens } from "@/theme/tokens";

const APP_VERSION = "NEWBIZZ v1.0.0";

export default function SyncScreen() {
  const state = Network.useNetworkState();
  const online = state.isConnected !== false && state.isInternetReachable !== false;
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ping = useCallback(async () => {
    if (pinging) return;
    setPinging(true);
    setErr(null);
    const net = await Network.getNetworkStateAsync();
    if (net.isConnected === false || net.isInternetReachable === false) {
      setErr("You are offline - connect and try again");
      setPinging(false);
      return;
    }
    const t0 = Date.now();
    try {
      const { error } = await supabase.from("users").select("id", { head: true, count: "exact" }).limit(1);
      if (error) throw error;
      setLatencyMs(Date.now() - t0);
      setCheckedAt(Date.now());
    } catch (e) {
      setErr(friendlyError(e));
      setLatencyMs(null);
      setCheckedAt(Date.now());
    } finally {
      setPinging(false);
    }
  }, [pinging]);

  const quality =
    latencyMs == null
      ? null
      : latencyMs < 400
        ? { label: "Excellent", tone: tokens.color.grn }
        : latencyMs < 1200
          ? { label: "Good", tone: tokens.color.amb }
          : { label: "Slow", tone: tokens.color.red };

  return (
    <Screen refreshing={pinging} onRefresh={() => void ping()}>
      <GradientHeader title="Sync & data" subtitle="Connection and data status" right={<HeaderRight />} />

      <View style={s.body}>
        <View style={[s.statusCard, { backgroundColor: online ? tokens.color.grnWash : tokens.color.redWash }]}>
          <View style={[s.statusIcon, { backgroundColor: online ? tokens.color.grn : tokens.color.red }]}>
            {online ? <Wifi size={26} color="#ffffff" /> : <WifiOff size={26} color="#ffffff" />}
          </View>
          <Text style={[s.statusTitle, { color: online ? tokens.color.grn : tokens.color.red }]}>
            {online ? "Online" : "Offline"}
          </Text>
          <Text style={s.statusSub}>
            {online
              ? "Live mode - every action saves directly to the server"
              : "You are offline - actions cannot be saved right now"}
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>CONNECTION</Text>
          <Row icon={Activity} label="Server latency" value={latencyMs == null ? "—" : `${latencyMs} ms`} extra={quality?.label} extraTone={quality?.tone} />
          <Row icon={Clock} label="Last checked" value={checkedAt ? timeAgoIST(new Date(checkedAt).toISOString()) : "—"} />
          <Pressable
            onPress={() => void ping()}
            disabled={pinging || !online}
            accessibilityLabel="Test connection"
            style={({ pressed }) => [s.testBtn, (pressed || pinging || !online) && { opacity: 0.6 }]}
          >
            <RefreshCw size={13} color={tokens.color.brand} />
            <Text style={s.testTxt}>{pinging ? "Testing..." : "Test connection"}</Text>
          </Pressable>
          {err ? <Text style={s.err}>{err}</Text> : null}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>DATA</Text>
          <Row icon={Database} label="Mode" value="Live (online-only)" extra="v1" extraTone={tokens.color.ink4} />
          <Row icon={ShieldCheck} label="Queued changes" value="0" extra="All synced" extraTone={tokens.color.grn} />
          <Text style={s.note}>
            Offline mode arrives in v2 - sales, collections and visits recorded without network will queue here and
            sync automatically.
          </Text>
        </View>

        <Text style={s.version}>{APP_VERSION}</Text>
      </View>
    </Screen>
  );
}

function Row({
  icon: Icon, label, value, extra, extraTone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  extra?: string;
  extraTone?: string;
}) {
  return (
    <View style={r.row}>
      <View style={r.iconWrap}>
        <Icon size={14} color={tokens.color.ink3} />
      </View>
      <Text style={r.label}>{label}</Text>
      <View style={r.right}>
        {extra ? <Text style={[r.extra, { color: extraTone ?? tokens.color.ink4 }]}>{extra}</Text> : null}
        <Text style={r.value}>{value}</Text>
      </View>
    </View>
  );
}

const r = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    minHeight: 44,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1, color: tokens.color.ink2, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  right: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  extra: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
  value: {
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
});

const s = StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  statusCard: {
    alignItems: "center",
    padding: tokens.space.xl,
    borderRadius: tokens.radius.lg,
    gap: tokens.space.xs,
  },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: tokens.space.xs,
  },
  statusTitle: { fontFamily: tokens.font.sansBold, fontSize: tokens.size.lg },
  statusSub: {
    color: tokens.color.ink2,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    padding: tokens.space.md,
    gap: tokens.space.xs,
    ...tokens.shadow.card,
  },
  cardTitle: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.6,
    marginBottom: tokens.space.xs,
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    marginTop: tokens.space.xs,
  },
  testTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  err: { color: tokens.color.red, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
  note: { color: tokens.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, lineHeight: 16, marginTop: tokens.space.xs },
  version: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.eyebrow,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
});
