import { View, Text, Pressable, StyleSheet } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Sheet } from "./Sheet";
import { buildMonthGrid } from "@/lib/opBuilders";
import { todayIST } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WD = ["M", "T", "W", "T", "F", "S", "S"];

export function MonthSheet({
  visible, year, month0, selected, dots, onPick, onClose, onMonth,
}: {
  visible: boolean;
  year: number;
  month0: number;
  selected: string;
  dots: Record<string, boolean>;
  onPick: (iso: string) => void;
  onClose: () => void;
  onMonth: (y: number, m: number) => void;
}) {
  const s = useStyles();
  const { palette: t } = useTheme();
  const today = todayIST();
  const grid = buildMonthGrid(year, month0);

  function step(dir: -1 | 1) {
    const next = month0 + dir;
    if (next < 0) onMonth(year - 1, 11);
    else if (next > 11) onMonth(year + 1, 0);
    else onMonth(year, next);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Select date">
      <View style={s.navRow}>
        <Pressable
          onPress={() => step(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={({ pressed }) => [s.navBtn, pressed && { opacity: 0.6 }]}
        >
          <ChevronLeft size={18} color={t.color.ink} />
        </Pressable>
        <Text style={s.navTitle}>{MONTHS[month0]} {year}</Text>
        <Pressable
          onPress={() => step(1)}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={({ pressed }) => [s.navBtn, pressed && { opacity: 0.6 }]}
        >
          <ChevronRight size={18} color={t.color.ink} />
        </Pressable>
      </View>
      <View style={s.wdRow}>
        {WD.map((d, i) => (
          <Text key={`${d}-${i}`} style={s.wd}>{d}</Text>
        ))}
      </View>
      {grid.map((week, r) => (
        <View key={`w${r}`} style={s.weekRow}>
          {week.map((iso, c) => {
            if (!iso) return <View key={`p${r}-${c}`} style={s.cell} />;
            const isSel = iso === selected;
            const isToday = iso === today;
            const day = String(Number(iso.slice(8, 10)));
            return (
              <Pressable
                key={iso}
                onPress={() => {
                  onPick(iso);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Pick ${iso}`}
                accessibilityState={{ selected: isSel }}
                style={[s.cell, isToday && s.cellToday, isSel && s.cellSel]}
              >
                <Text style={[s.day, isSel && s.daySel]}>{day}</Text>
                {iso in dots ? (
                  <View style={[s.dot, { backgroundColor: dots[iso] ? t.color.grn : t.color.ink4 }]} />
                ) : (
                  <View style={s.dotIdle} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </Sheet>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: tokens.space.sm },
    navBtn: {
      minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center",
      borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.surface,
    },
    navTitle: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
    wdRow: { flexDirection: "row", marginBottom: 2 },
    wd: {
      flex: 1, textAlign: "center", color: t.color.ink4,
      fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow,
    },
    weekRow: { flexDirection: "row" },
    cell: {
      flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center",
      borderRadius: tokens.radius.md, borderWidth: 1, borderColor: "transparent", paddingVertical: 2,
    },
    cellToday: { borderColor: t.color.brand },
    cellSel: { backgroundColor: t.color.ink, borderColor: t.color.ink },
    day: {
      color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs,
      fontVariant: ["tabular-nums"],
    },
    daySel: { color: t.color.surface },
    dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
    dotIdle: { width: 5, height: 5, marginTop: 2 },
  });
};
