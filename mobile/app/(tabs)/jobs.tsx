import { useMemo, useState } from "react";
import { View, Text, Pressable, Alert, StyleSheet } from "react-native";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { CircleCheck, Factory, Play, X } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { dateIST } from "@/lib/format";
import {
  useJobCards, setJobCardStatus, postProductionRun, type JobCardRow,
} from "@/data/production";
import { qk } from "@/data/keys";
import { tokens } from "@/theme/tokens";

type Filter = "pending" | "in_progress" | "completed";

function stageLabel(stage: number): string {
  return stage === 1 ? "Blowing" : "Filling";
}

export default function JobsScreen() {
  const { claims } = useSession();
  const s = useStyles();
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const jobs = useJobCards();
  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<JobCardRow | null>(null);

  const rows = useMemo(() => (jobs.data ?? []).filter((j) => j.status === filter), [jobs.data, filter]);
  const counts = useMemo(() => {
    const c = { pending: 0, in_progress: 0, completed: 0 };
    for (const j of jobs.data ?? []) {
      if (j.status in c) c[j.status as keyof typeof c]++;
    }
    return c;
  }, [jobs.data]);

  async function onStart(j: JobCardRow) {
    if (busyId) return;
    setBusyId(j.id);
    try {
      await setJobCardStatus(j.id, "in_progress");
      await qc.invalidateQueries({ queryKey: qk.jobCards() });
      Toast.show({ type: "success", text1: "Job started", text2: j.jobNo });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not start job", text2: friendlyError(e) });
    } finally {
      setBusyId(null);
    }
  }

  function onCancelJob(j: JobCardRow) {
    if (busyId) return;
    Alert.alert("Cancel job", `Cancel ${j.jobNo}?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel job",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusyId(j.id);
            try {
              await setJobCardStatus(j.id, "cancelled");
              await qc.invalidateQueries({ queryKey: qk.jobCards() });
              Toast.show({ type: "success", text1: "Job cancelled" });
            } catch (e) {
              Toast.show({ type: "error", text1: "Could not cancel", text2: friendlyError(e) });
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  }

  async function onComplete(j: JobCardRow, outputQty: number, wastage: number | null, notes: string | null) {
    if (busyId) return;
    setBusyId(j.id);
    try {
      const runId = await postProductionRun({
        outputItemId: j.outputItemId,
        outputQty,
        stage: (j.stage === 2 ? 2 : 1) as 1 | 2,
        runDate: j.cardDate,
        abnormalWastageValue: wastage,
        notes: notes ?? null,
      });
      await setJobCardStatus(j.id, "completed", runId);
      await qc.invalidateQueries({ queryKey: qk.jobCards() });
      Toast.show({ type: "success", text1: "Run posted", text2: `${j.jobNo} completed` });
      setCompleting(null);
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not complete job", text2: friendlyError(e) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={() => qc.invalidateQueries({ queryKey: qk.jobCards() })}>
      <GradientHeader title="Production jobs" subtitle={roleLabel(claims)} right={<HeaderRight />} />

      <View style={s.body}>
        <View style={s.filters}>
          <FilterBtn label={`Pending ${counts.pending || ""}`} active={filter === "pending"} onPress={() => setFilter("pending")} />
          <FilterBtn label={`Running ${counts.in_progress || ""}`} active={filter === "in_progress"} onPress={() => setFilter("in_progress")} />
          <FilterBtn label={`Done ${counts.completed || ""}`} active={filter === "completed"} onPress={() => setFilter("completed")} />
        </View>

        {jobs.isLoading ? (
          <SkeletonRows rows={5} />
        ) : jobs.isError ? (
          <EmptyState title="Could not load jobs" message={friendlyError(jobs.error)} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Factory}
            title={filter === "pending" ? "No pending jobs" : filter === "in_progress" ? "Nothing running" : "Nothing completed yet"}
            message="Job cards created by the manager will appear here."
          />
        ) : (
          rows.map((j) => (
            <JobCard
              key={j.id}
              job={j}
              busy={busyId === j.id}
              onStart={() => void onStart(j)}
              onCancelJob={() => onCancelJob(j)}
              onComplete={() => setCompleting(j)}
            />
          ))
        )}
      </View>

      {completing ? (
        <CompleteSheet
          job={completing}
          busy={busyId === completing.id}
          onClose={() => setCompleting(null)}
          onComplete={(qty, wastage, notes) => {
            void onComplete(completing, qty, wastage, notes);
          }}
        />
      ) : null}
    </Screen>
  );
}

function FilterBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { palette: t } = useTheme();
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[s.filterBtn, active && s.filterBtnOn]}
    >
      <Text style={[s.filterTxt, active && s.filterTxtOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function JobCard({
  job, busy, onStart, onCancelJob, onComplete,
}: {
  job: JobCardRow;
  busy: boolean;
  onStart: () => void;
  onCancelJob: () => void;
  onComplete: () => void;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const tone = job.status === "completed" ? "grn" : job.status === "in_progress" ? "brand" : job.status === "cancelled" ? "red" : "amb";
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.chip}>
          <Factory size={14} color={t.color.brand} />
        </View>
        <View style={s.main}>
          <Text style={s.jobNo}>{job.jobNo}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {stageLabel(job.stage)} · {job.outputName} · {dateIST(job.cardDate)}
          </Text>
        </View>
        <StatusBadge label={job.status.replace("_", " ")} tone={tone} />
      </View>
      <View style={s.metaRow}>
        <Text style={s.target}>
          Target {job.targetQty.toLocaleString("en-IN")}
        </Text>
        {job.deviceLabel ? <Text style={s.meta} numberOfLines={1}>Device {job.deviceLabel}</Text> : null}
        {job.assignedToName ? <Text style={s.meta} numberOfLines={1}>{job.assignedToName}</Text> : null}
      </View>
      {job.instructions ? (
        <Text style={s.instructions} numberOfLines={2}>{job.instructions}</Text>
      ) : null}
      {job.status === "pending" ? (
        <View style={s.actions}>
          <Pressable
            onPress={onStart}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Start ${job.jobNo}`}
            style={({ pressed }) => [s.btn, s.btnGrn, (pressed || busy) && { opacity: 0.8 }]}
          >
            <Play size={14} color="#ffffff" />
            <Text style={s.btnTxt}>Start job</Text>
          </Pressable>
          <Pressable
            onPress={onCancelJob}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Cancel ${job.jobNo}`}
            style={({ pressed }) => [s.btn, s.btnGhost, (pressed || busy) && { opacity: 0.7 }]}
          >
            <X size={14} color={t.color.red} />
            <Text style={[s.btnTxt, { color: t.color.red }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      {job.status === "in_progress" ? (
        <View style={s.actions}>
          <Pressable
            onPress={onComplete}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Complete ${job.jobNo}`}
            style={({ pressed }) => [s.btn, s.btnGrn, (pressed || busy) && { opacity: 0.8 }]}
          >
            <CircleCheck size={14} color="#ffffff" />
            <Text style={s.btnTxt}>Post run & complete</Text>
          </Pressable>
        </View>
      ) : null}
      {job.status === "completed" && job.runNo ? (
        <Text style={s.runRef}>Run {job.runNo} posted</Text>
      ) : null}
    </View>
  );
}

function CompleteSheet({
  job, busy, onClose, onComplete,
}: {
  job: JobCardRow;
  busy: boolean;
  onClose: () => void;
  onComplete: (qty: number, wastage: number | null, notes: string | null) => void;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const [qty, setQty] = useState(String(job.targetQty));
  const [wastage, setWastage] = useState("");
  const [notes, setNotes] = useState("");

  const n = Number(qty.replace(/[^0-9.]/g, ""));
  const canPost = Number.isFinite(n) && n > 0 && !busy;

  return (
    <Sheet visible onClose={onClose} title={`Complete ${job.jobNo}`}>
      <View style={s.sheetBody}>
        <Text style={s.sheetSub}>
          {stageLabel(job.stage)} · {job.outputName} · target {job.targetQty.toLocaleString("en-IN")}
        </Text>
        <View style={s.section}>
          <Text style={s.label}>OUTPUT QUANTITY</Text>
          <View style={s.amountWrap}>
            <TextInput
              style={s.amountInput}
              value={qty}
              onChangeText={(v) => setQty(v.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              accessible
              accessibilityLabel="Output quantity"
            />
          </View>
        </View>
        <View style={s.section}>
          <Text style={s.label}>ABNORMAL WASTAGE VALUE (RUPEES, OPTIONAL)</Text>
          <View style={s.amountWrap}>
            <TextInput
              style={[s.amountInput, { fontSize: tokens.size.sm, fontFamily: tokens.font.sansSemi }]}
              value={wastage}
              onChangeText={(v) => setWastage(v.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={t.color.ink4}
              accessible
              accessibilityLabel="Abnormal wastage value"
            />
          </View>
        </View>
        <View style={s.section}>
          <Text style={s.label}>NOTES (OPTIONAL)</Text>
          <TextInput
            style={s.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything worth noting about this run"
            placeholderTextColor={t.color.ink4}
            multiline
            accessible
            accessibilityLabel="Run notes"
          />
        </View>
        <Pressable
          onPress={() => onComplete(Math.round(n * 100) / 100, wastage ? Number(wastage) : null, notes.trim() || null)}
          disabled={!canPost}
          accessibilityRole="button"
          accessibilityLabel="Post run"
          style={({ pressed }) => [s.postBtn, (!canPost || pressed) && { opacity: 0.6 }]}
        >
          <Text style={s.postBtnTxt}>Post run & complete job</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

import { Sheet } from "@/components/Sheet";
import { TextInput } from "react-native";
import { useTheme } from "@/theme/ThemeContext";

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.space.lg,
      paddingTop: tokens.space.lg,
      gap: tokens.space.md,
    },
    filters: {
      flexDirection: "row",
      backgroundColor: t.color.fill,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: 3,
      gap: 3,
    },
    filterBtn: {
      flex: 1,
      minHeight: 40,
      borderRadius: tokens.radius.sm,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    filterBtnOn: { backgroundColor: t.color.surface, ...tokens.shadow.card },
    filterTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    filterTxtOn: { color: t.color.brand },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: "rgba(148,163,184,0.25)",
      padding: tokens.space.md,
      gap: tokens.space.sm,
      ...tokens.shadow.card,
    },
    head: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
    chip: {
      width: 30,
      height: 30,
      borderRadius: tokens.radius.sm,
      backgroundColor: t.color.brandWash,
      alignItems: "center",
      justifyContent: "center",
    },
    main: { flex: 1, minWidth: 0 },
    jobNo: {
      color: t.color.ink,
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.sm,
      fontVariant: ["tabular-nums"],
    },
    sub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, flexWrap: "wrap" },
    target: {
      color: t.color.ink,
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.xs,
      fontVariant: ["tabular-nums"],
    },
    meta: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    instructions: {
      color: t.color.ink3,
      fontFamily: tokens.font.sans,
      fontSize: tokens.size.xs,
      fontStyle: "italic",
      lineHeight: 16,
    },
    actions: { flexDirection: "row", gap: tokens.space.sm },
    btn: {
      flex: 1,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: tokens.space.xs,
    },
    btnGrn: { backgroundColor: t.color.grn },
    btnGhost: {
      backgroundColor: t.color.surface,
      borderWidth: 1,
      borderColor: t.color.line,
    },
    btnTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    runRef: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    sheetBody: { gap: tokens.space.lg, paddingBottom: tokens.space.md },
    sheetSub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
    section: { gap: tokens.space.xs },
    label: {
      color: t.color.ink3,
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.eyebrow,
      letterSpacing: 0.6,
    },
    amountWrap: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: t.color.line,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: tokens.space.md,
      justifyContent: "center",
    },
    amountInput: {
      color: t.color.ink,
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.lg,
      fontVariant: ["tabular-nums"],
      paddingVertical: 0,
    },
    notesInput: {
      minHeight: 72,
      textAlignVertical: "top",
      borderWidth: 1,
      borderColor: t.color.line,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm,
      color: t.color.ink,
      fontFamily: tokens.font.sans,
      fontSize: tokens.size.sm,
    },
    postBtn: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.grn,
      alignItems: "center",
      justifyContent: "center",
    },
    postBtnTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  });
};
