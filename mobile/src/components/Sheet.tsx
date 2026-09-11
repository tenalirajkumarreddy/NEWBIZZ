import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Bottom sheet. Because `statusBarTranslucent` disables Android's automatic
 * window resize inside transparent Modals, the keyboard would otherwise
 * cover the lower inputs — we track the keyboard height and pad the scroll
 * content so the focused field always stays visible.
 */
export function Sheet({
  visible, onClose, title, children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKbHeight(0);
      return;
    }
    const showEv = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEv = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEv, (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEv, () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.flex}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + tokens.space.lg }]}>
          <View style={s.handle} />
          {title ? <Text style={s.title}>{title}</Text> : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[s.content, kbHeight > 0 ? { paddingBottom: kbHeight } : null]}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.4)",
  },
  sheet: {
    backgroundColor: t.color.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "85%",
    ...t.shadow.pop,
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
  },
  content: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: tokens.space.lg,
  },
});
  }, [palette]);
};
