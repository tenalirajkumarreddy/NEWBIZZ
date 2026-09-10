import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Switch } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { ArrowLeft, BellOff, CheckCheck, Settings2 } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { PressCard } from "@/components/PressCard";
import { useNotifications, markRead, type NotificationRow } from "@/data/notifications";
import { useNotifPrefs, setNotifPref, type NotifChannel } from "@/data/notifPrefs";
import { useSession } from "@/lib/session";
import { qk } from "@/data/keys";
import { friendlyError } from "@/lib/rpc";
import { timeAgoIST } from "@/lib/format";
import { tokens } from "@/theme/tokens";

const SEV: Record<string, { fg: string }> = {
  info: { fg: tokens.color.brand },
  success: { fg: tokens.color.grn },
  warning: { fg: tokens.color.amb },
  critical: { fg: tokens.color.red },
};

function NotificationRowItem({ n, onPress }: { n: NotificationRow; onPress: (n: NotificationRow) => void }) {
  const sev = SEV[n.severity] ?? SEV.info;
  const unread = n.status === "unread";
  return (
    <PressCard onPress={() => onPress(n)}>
      <View style={s.row}>
        <View style={s.dotWrap}>
          <View style={[s.dot, { backgroundColor: sev.fg, opacity: unread ? 1 : 0.35 }]} />
        </View>
        <View style={s.main}>
          <Text style={[s.title, unread && s.titleUnread]}>{n.title}</Text>
          {n.body ? (
            <Text style={s.bodyTxt} numberOfLines={2}>{n.body}</Text>
          ) : null}
          <Text style={s.time}>{timeAgoIST(n.created_at)}</Text>
        </View>
        {unread ? <View style={s.unreadDot} /> : null}
      </View>
    </PressCard>
  );
}

const CATEGORIES: { key: string; label: string; sub: string }[] = [
  { key: "transfer", label: "Cash handovers", sub: "Handovers and deposits involving you" },
  { key: "expense", label: "Expenses", sub: "Submissions and approval outcomes" },
];

const CHANNELS: { key: NotifChannel; label: string }[] = [
  { key: "in_app", label: "In-app" },
  { key: "whatsapp", label: "WhatsApp" },
];

function PrefsSection() {
  const { user } = useSession();
  const prefs = useNotifPrefs();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  function isEnabled(category: string, channel: NotifChannel): boolean {
    const hit = (prefs.data ?? []).find((p) => p.category === category && p.channel === channel);
    return hit ? hit.enabled : true; // server default is enabled
  }

  async function toggle(category: string, channel: NotifChannel, value: boolean) {
    if (!user?.id || busyKey) return;
    const key = `${category}:${channel}`;
    setBusyKey(key);
    try {
      await setNotifPref({ userId: user.id, category, channel, enabled: value });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not save preference", text2: friendlyError(e) });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <View style={s.prefsCard}>
      <Pressable
        onPress={() => setShow((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel="Notification preferences"
        accessibilityState={{ expanded: show }}
        style={({ pressed }) => [s.prefsHead, pressed && { opacity: 0.85 }]}
      >
        <Settings2 size={15} color={tokens.color.ink2} />
        <Text style={s.prefsTitle}>Notification settings</Text>
        <Text style={s.prefsHint}>{show ? "Hide" : "Manage"}</Text>
      </Pressable>
      {show ? (
        prefs.isLoading ? (
          <SkeletonRows rows={2} />
        ) : (
          <View style={s.prefsBody}>
            {CATEGORIES.map((c) => (
              <View key={c.key} style={s.prefCat}>
                <Text style={s.prefLabel}>{c.label}</Text>
                <Text style={s.prefSub}>{c.sub}</Text>
                <View style={s.prefChannels}>
                  {CHANNELS.map((ch) => {
                    const on = isEnabled(c.key, ch.key);
                    return (
                      <View key={ch.key} style={s.prefRow}>
                        <Text style={s.prefChannel}>{ch.label}</Text>
                        <Switch
                          value={on}
                          disabled={busyKey === `${c.key}:${ch.key}`}
                          onValueChange={(v) => void toggle(c.key, ch.key, v)}
                          trackColor={{ true: tokens.color.brand, false: tokens.color.line }}
                          thumbColor="#ffffff"
                          accessibilityLabel={`${ch.label} notifications for ${c.label}`}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

export default function NotificationsScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const notifs = useNotifications();
  const [marking, setMarking] = useState(false);

  const rows = useMemo(() => notifs.data ?? [], [notifs.data]);
  const unreadCount = rows.filter((n) => n.status === "unread").length;

  async function onRefresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.notifications() }),
      qc.invalidateQueries({ queryKey: qk.unread() }),
    ]);
  }

  async function markAll() {
    if (marking || unreadCount === 0) return;
    setMarking(true);
    try {
      await markRead();
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.notifications() }),
        qc.invalidateQueries({ queryKey: qk.unread() }),
      ]);
      Toast.show({ type: "success", text1: "All marked read" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not mark read", text2: friendlyError(e) });
    } finally {
      setMarking(false);
    }
  }

  async function markOne(n: NotificationRow) {
    if (n.status !== "unread") return;
    try {
      await markRead([n.id]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.notifications() }),
        qc.invalidateQueries({ queryKey: qk.unread() }),
      ]);
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not mark read", text2: friendlyError(e) });
    }
  }

  return (
    <View style={s.root}>
      <GradientHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        right={
          unreadCount > 0 ? (
            <Pressable
              onPress={() => void markAll()}
              disabled={marking}
              accessibilityLabel="Mark all read"
              style={({ pressed }) => [s.markAll, (pressed || marking) && { opacity: 0.7 }]}
            >
              <CheckCheck size={14} color="#ffffff" />
              <Text style={s.markAllTxt}>Mark all read</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.back()}
              accessibilityLabel="Go back"
              style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.85 }]}
            >
              <ArrowLeft size={16} color="#ffffff" />
            </Pressable>
          )
        }
      />
      <Screen refreshing={notifs.isRefetching} onRefresh={onRefresh}>
        <View style={s.body}>
          <PrefsSection />
          {notifs.isLoading ? (
            <SkeletonRows rows={5} />
          ) : notifs.isError ? (
            <EmptyState title="Could not load notifications" message={friendlyError(notifs.error)} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="No notifications"
              message="Alerts about approvals, handovers and stock will appear here."
            />
          ) : (
            <View style={s.list}>
              {rows.map((n) => (
                <NotificationRowItem key={n.id} n={n} onPress={(x) => void markOne(x)} />
              ))}
            </View>
          )}
        </View>
      </Screen>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  markAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: tokens.space.sm,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.white15,
  },
  markAllTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    margin: -tokens.space.sm,
  },
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  list: { gap: tokens.space.sm },
  prefsCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    ...tokens.shadow.card,
  },
  prefsHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    minHeight: 48,
    paddingHorizontal: tokens.space.md,
  },
  prefsTitle: { flex: 1, color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  prefsHint: { color: tokens.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  prefsBody: { paddingHorizontal: tokens.space.md, paddingBottom: tokens.space.md },
  prefCat: { gap: 2, paddingVertical: tokens.space.xs },
  prefLabel: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  prefSub: { color: tokens.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
  prefChannels: { marginTop: tokens.space.xs, gap: tokens.space.xs },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
  },
  prefChannel: { color: tokens.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  row: { flexDirection: "row", gap: tokens.space.md, padding: tokens.space.md },
  dotWrap: { paddingTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  main: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    color: tokens.color.ink2,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.xs,
  },
  titleUnread: { color: tokens.color.ink, fontFamily: tokens.font.sansBold },
  bodyTxt: {
    color: tokens.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    lineHeight: 17,
  },
  time: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow,
    marginTop: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.brand,
    alignSelf: "flex-start",
    marginTop: 6,
  },
});
