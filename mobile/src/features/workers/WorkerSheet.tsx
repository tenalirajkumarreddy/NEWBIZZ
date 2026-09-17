import { View, Text, StyleSheet } from "react-native";
import { Sheet } from "@/components/Sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import {
  useAttendanceHistory, usePayrollPeople, useWorkerLedger,
} from "@/data/payroll";
import { friendlyError } from "@/lib/rpc";
import { dateIST, moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

/** Spec §2 sign/color rule (single source of truth for this surface):
 * positive = WH owes the person = RED; negative = person owes WH = GREEN;
 * zero = neutral. */
export function balanceTone(v: number): "red" | "grn" | "neutral" {
  if (v > 0) return "red";
  if (v < 0) return "grn";
  return "neutral";
}

/** Spec §2 pill copy. Amounts shown as absolute values — the words carry the sign. */
export function balancePillText(balance: number): string {
  if (balance > 0) return `WH owes ${moneyINR(Math.abs(balance))}`;
  if (balance < 0) return `owes ${moneyINR(Math.abs(balance))}`;
  return "Settled";
}

const ATT_TONE: Record<string, "neutral" | "brand" | "grn" | "amb" | "red"> = {
  present: "grn",
  half_day: "amb",
  absent: "red",
  leave: "neutral",
  holiday: "neutral",
  week_off: "neutral",
};

function humanizeType(t: string): string {
  return t.replace(/_/g, " ");
}

/** Read-only worker detail: profile + last-30-days attendance + signed ledger. */
export function WorkerSheet({
  visible, onClose, entityType, entityId, entityName,
}: {
  visible: boolean;
  onClose: () => void;
  entityType: "user" | "worker" | null;
  entityId: string | null;
  /** Fallback name from the card while the roster is still loading. */
  entityName?: string;
}) {
  const s = useStyles();
  const { palette: t } = useTheme();
  const rosterQ = usePayrollPeople(visible);
  const person = (rosterQ.data ?? []).find(
    (p) => p.entityType === entityType && p.entityId === entityId,
  );
  const name = person?.fullName ?? entityName ?? "Worker";
  // Null entityId disables the queries — the sheet is read-only, no mutations.
  const attQ = useAttendanceHistory(entityType ?? "worker", visible ? entityId : null);
  const ledQ = useWorkerLedger(visible ? entityId : null);

  return (
    <Sheet visible={visible} onClose={onClose} title={name}>
      <View style={s.body}>
        <View style={s.profile}>
          <StatusBadge
            label={entityType === "user" ? "user" : "worker"}
            tone={entityType === "user" ? "brand" : "neutral"}
          />
          {person?.phone ? <Text style={s.profLine}>{person.phone}</Text> : null}
          {person?.aadharNumber ? <Text style={s.profLine}>Aadhaar {person.aadharNumber}</Text> : null}
          {person?.address ? <Text style={s.profLine}>{person.address}</Text> : null}
        </View>

        <View style={s.section}>
          <Text style={s.h}>Attendance (last 30 days)</Text>
          {attQ.isLoading ? <SkeletonRows rows={3} />
            : attQ.isError ? <Text style={s.err}>{friendlyError(attQ.error)}</Text>
            : (attQ.data ?? []).length === 0 ? (
              <EmptyState title="No attendance in the last 30 days" />
            ) : (
              <View style={s.rows}>
                {(attQ.data ?? []).map((r) => (
                  <View key={r.dateISO} style={s.row}>
                    <View style={s.rowTop}>
                      <Text style={s.date}>{dateIST(r.dateISO)}</Text>
                      <StatusBadge label={r.status.replace(/_/g, " ")} tone={ATT_TONE[r.status] ?? "neutral"} />
                    </View>
                    <Text style={s.meta}>
                      {r.hours}h{r.otHours ? ` + ${r.otHours}h OT` : ""}{r.shift ? ` · ${r.shift}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            )}
        </View>

        <View style={s.section}>
          <Text style={s.h}>Ledger</Text>
          {ledQ.isLoading ? <SkeletonRows rows={3} />
            : ledQ.isError ? <Text style={s.err}>{friendlyError(ledQ.error)}</Text>
            : (ledQ.data ?? []).length === 0 ? (
              <EmptyState title="No transactions yet" />
            ) : (
              <View style={s.rows}>
                {(ledQ.data ?? []).map((l) => {
                  const tone = balanceTone(l.amount);
                  return (
                    <View key={l.id} style={s.row}>
                      <View style={s.rowTop}>
                        <Text style={s.date}>{dateIST(l.dateISO)}</Text>
                        <Text
                          style={[
                            s.amt,
                            tone === "red" ? { color: t.color.red }
                              : tone === "grn" ? { color: t.color.grn }
                              : { color: t.color.ink3 },
                          ]}
                        >
                          {moneyINR(l.amount)}
                        </Text>
                      </View>
                      <View style={s.rowTop}>
                        <Text style={s.meta}>{humanizeType(l.type)}</Text>
                        <Text style={s.run}>bal {moneyINR(l.running)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
        </View>
      </View>
    </Sheet>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    body: { gap: tokens.space.lg, paddingBottom: tokens.space.md },
    profile: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: tokens.space.sm },
    profLine: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    section: { gap: tokens.space.sm },
    h: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
    err: { color: t.color.red, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    rows: { gap: tokens.space.sm },
    row: {
      backgroundColor: t.color.fill, borderRadius: tokens.radius.md, borderWidth: 1,
      borderColor: t.color.line, padding: tokens.space.sm, gap: 2,
    },
    rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    date: {
      color: t.color.ink, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow,
      fontVariant: ["tabular-nums"],
    },
    meta: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    amt: {
      fontFamily: tokens.font.monoBold, fontSize: tokens.size.eyebrow,
      fontVariant: ["tabular-nums"],
    },
    run: {
      color: t.color.ink2, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow,
      fontVariant: ["tabular-nums"],
    },
  });
};
