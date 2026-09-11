import { useMemo, useState } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal, TextInput, FlatList, ScrollView,
} from "react-native";
import { ChevronDown, Check, Search } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

export interface DropdownOption {
  value: string;
  label: string;
  sub?: string;
}

/**
 * Field-style dropdown: tap to open a search-backed picker modal. Scales to
 * long option lists (recipient selection) unlike per-item buttons.
 */
export function DropdownSelect({
  value, options, onChange, placeholder, label,
}: {
  value: string | null;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) =>
      `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(needle),
    );
  }, [options, query]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label ?? "Select"}
        accessibilityState={{ selected: !!selected }}
        style={({ pressed }) => [s.field, pressed && { opacity: 0.85 }]}
      >
        <Text style={[s.value, !selected && s.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder ?? "Select"}
        </Text>
        <ChevronDown size={16} color={t.color.ink3} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={s.flex}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.title}>{label ?? "Select"}</Text>
            {options.length > 8 ? (
              <View style={s.searchWrap}>
                <Search size={15} color={t.color.ink4} />
                <TextInput
                  style={s.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search"
                  placeholderTextColor={t.color.ink4}
                  accessible
                  accessibilityLabel={`Search ${label ?? "options"}`}
                />
              </View>
            ) : null}
            {filtered.length === 0 ? (
              <Text style={s.empty}>No matches</Text>
            ) : (
              <FlatList
                data={filtered}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => {
                  const active = item.value === value;
                  return (
                    <Pressable
                      onPress={() => {
                        onChange(item.value);
                        setOpen(false);
                        setQuery("");
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [s.row, active && s.rowActive, pressed && { opacity: 0.85 }]}
                    >
                      <View style={s.avatar}>
                        <Text style={s.avatarTxt}>
                          {item.label.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?"}
                        </Text>
                      </View>
                      <View style={s.rowMain}>
                        <Text style={[s.rowLabel, active && s.rowLabelActive]} numberOfLines={1}>
                          {item.label}
                        </Text>
                        {item.sub ? (
                          <Text style={s.rowSub} numberOfLines={1}>{item.sub}</Text>
                        ) : null}
                      </View>
                      {active ? <Check size={16} color={t.color.brand} /> : null}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)" },
    sheet: {
      backgroundColor: t.color.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: "78%",
      paddingBottom: tokens.space.xl,
      ...tokens.shadow.pop,
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.color.line,
      marginTop: tokens.space.sm,
    },
    title: {
      color: t.color.ink,
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.sm,
      paddingHorizontal: tokens.space.lg,
      paddingTop: tokens.space.md,
      paddingBottom: tokens.space.xs,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space.sm,
      minHeight: 46,
      marginHorizontal: tokens.space.lg,
      marginTop: tokens.space.md,
      marginBottom: tokens.space.xs,
      paddingHorizontal: tokens.space.md,
      borderWidth: 1,
      borderColor: t.color.line,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.fill,
    },
    searchInput: {
      flex: 1,
      color: t.color.ink,
      fontFamily: tokens.font.sans,
      fontSize: tokens.size.sm,
      paddingVertical: 0,
    },
    empty: {
      color: t.color.ink4,
      fontFamily: tokens.font.sans,
      fontSize: tokens.size.xs,
      paddingHorizontal: tokens.space.lg,
      paddingVertical: tokens.space.lg,
      textAlign: "center",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space.md,
      minHeight: 56,
      marginHorizontal: tokens.space.md,
      marginTop: tokens.space.xs,
      paddingHorizontal: tokens.space.md,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: "transparent",
      backgroundColor: t.color.surface,
    },
    rowActive: { backgroundColor: t.color.brandWash, borderColor: t.color.brand },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: t.color.brandWash,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarTxt: { color: t.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    rowMain: { flex: 1, minWidth: 0 },
    rowLabel: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    rowLabelActive: { color: t.color.brand },
    rowSub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space.sm,
      minHeight: 52,
      borderWidth: 1,
      borderColor: t.color.line,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: tokens.space.md,
    },
    value: {
      flex: 1,
      color: t.color.ink,
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.sm,
    },
    placeholder: { color: t.color.ink4, fontFamily: tokens.font.sans },
  });
};
